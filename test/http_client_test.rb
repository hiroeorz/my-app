require "minitest/autorun"
require "json"
require "base64"

runtime_dir = File.expand_path("../node_modules/@hibana-apps/runtime/dist/ruby/app/hibana", __dir__)
$LOAD_PATH.unshift runtime_dir

require "host_bridge"
require "context"
require "http_client"

class HttpFetchStub
  attr_accessor :response_json
  attr_reader :payloads

  def initialize
    @payloads = []
    @response_json = nil
  end

  def apply(payload_json)
    @payloads << payload_json
    response_json || raise("response_json must be set in HttpFetchStub")
  end
end

class HttpClientTest < Minitest::Test
  def setup
    @stub = HttpFetchStub.new
    HostBridge.ts_http_fetch = @stub
  end

  def teardown
    HostBridge.ts_http_fetch = nil
  end

  def test_get_request_builds_payload_and_returns_response
    @stub.response_json = JSON.generate(
      "ok" => true,
      "status" => 200,
      "statusText" => "OK",
      "headers" => { "content-type" => "text/plain" },
      "body" => "hello",
      "responseType" => "text",
      "url" => "https://example.com/data",
    )

    client = Http::Client.new
    response = client.get("https://example.com/data", query: { foo: "bar" }, headers: { "X-Test" => 1 })

    payload = JSON.parse(@stub.payloads.last)
    assert_equal "GET", payload["method"]
    assert_equal "https://example.com/data?foo=bar", payload["url"]
    assert_equal({ "X-Test" => "1" }, payload["headers"])

    assert response.success?
    assert_equal "hello", response.body
  end

  def test_post_request_with_json_body
    @stub.response_json = JSON.generate(
      "ok" => true,
      "status" => 201,
      "statusText" => "Created",
      "headers" => { "content-type" => "application/json" },
      "body" => '{"result":"ok"}',
      "responseType" => "json",
      "url" => "https://example.com/posts",
    )

    client = Http::Client.new
    response = client.post("https://example.com/posts", json: { title: "Hello" })

    payload = JSON.parse(@stub.payloads.last)
    assert_equal "POST", payload["method"]
    assert_equal "{\"title\":\"Hello\"}", payload["body"]
    assert_equal "application/json", payload["headers"]["content-type"]
    assert_nil payload["responseType"]

    assert response.success?
    assert_equal({ "result" => "ok" }, response.json)
  end

  def test_binary_response_is_decoded
    encoded = Base64.strict_encode64("binary-data")
    @stub.response_json = JSON.generate(
      "ok" => true,
      "status" => 200,
      "statusText" => "OK",
      "headers" => {},
      "body" => encoded,
      "responseType" => "arrayBuffer",
      "url" => "https://example.com/file",
      "base64" => true,
    )

    client = Http::Client.new
    response = client.get("https://example.com/file")

    assert_equal "binary-data", response.body
  end

  def test_http_error_raises_exception
    @stub.response_json = JSON.generate(
      "ok" => false,
      "error" => { "message" => "boom" },
    )

    client = Http::Client.new

    error = assert_raises(Http::Error) do
      client.get("https://example.com/error")
    end

    assert_equal "boom", error.message
  end
end
