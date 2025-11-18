import { Buffer } from "node:buffer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  executeHttpFetch,
  inferResponseType,
  normalizeHeaders,
  parseHttpRequestPayload,
} from "@hibana-apps/runtime/http-fetch-utils"

describe("parseHttpRequestPayload", () => {
  it("指定したURLとメソッドを正しく設定する", () => {
    const payload = parseHttpRequestPayload(
      JSON.stringify({
        url: "https://example.com/api",
        method: "post",
        headers: { "X-Token": "123" },
        body: '{"foo": "bar"}',
      }),
    )

    expect(payload.url).toBe("https://example.com/api")
    expect(payload.method).toBe("POST")
    expect(payload.headers).toEqual({ "X-Token": "123" })
    expect(payload.body).toBe('{"foo": "bar"}')
  })

  it("URLが欠落している場合は例外を発生させる", () => {
    expect(() => parseHttpRequestPayload("{}"))
      .toThrowError(/HTTP request payload must include url/)
  })
})

describe("normalizeHeaders", () => {
  it("値を文字列に整形し、配列はカンマ区切りにまとめる", () => {
    const result = normalizeHeaders({
      "X-Token": 123,
      Accept: ["application/json", "text/plain"],
    })

    expect(result).toEqual({
      "X-Token": "123",
      Accept: "application/json, text/plain",
    })
  })
})

describe("inferResponseType", () => {
  const createResponse = (contentType: string): Response =>
    new Response("", {
      headers: { "content-type": contentType },
    })

  it("JSONのcontent-typeを検出する", () => {
    const response = createResponse("application/json; charset=utf-8")
    expect(inferResponseType(response)).toBe("json")
  })

  it("バイナリ系content-typeを検出する", () => {
    const response = createResponse("image/png")
    expect(inferResponseType(response)).toBe("arrayBuffer")
  })

  it("該当しない場合はtextを返す", () => {
    const response = createResponse("text/plain")
    expect(inferResponseType(response)).toBe("text")
  })
})

describe("executeHttpFetch", () => {
  beforeEach(() => {
    if (typeof btoa !== "function") {
      vi.stubGlobal("btoa", (input: string) =>
        Buffer.from(input, "binary").toString("base64"),
      )
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("テキストレスポンスを処理する", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
      url: "https://example.com/",
      text: async () => "hello",
      arrayBuffer: async () => new ArrayBuffer(0),
    }))

    vi.stubGlobal("fetch", fetchMock)

    const result = await executeHttpFetch({
      url: "https://example.com/",
      method: "GET",
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body).toBe("hello")
      expect(result.responseType).toBe("text")
    }
  })

  it("バイナリレスポンスをBase64へ変換する", async () => {
    const bytes = Uint8Array.from([104, 105]) // "hi"
    const fetchMock = vi.fn(async () => ({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/octet-stream" }),
      url: "https://example.com/file",
      text: async () => "unused",
      arrayBuffer: async () => bytes.buffer,
    }))

    vi.stubGlobal("fetch", fetchMock)

    const result = await executeHttpFetch({
      url: "https://example.com/file",
      method: "GET",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const expected = Buffer.from("hi", "binary").toString("base64")
      expect(result.base64).toBe(true)
      expect(result.body).toBe(expected)
      expect(result.responseType).toBe("arrayBuffer")
    }
  })

  it("例外発生時にエラーレスポンスを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network failure"))),
    )

    const result = await executeHttpFetch({
      url: "https://example.com/error",
      method: "GET",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain("network failure")
    }
  })
})
