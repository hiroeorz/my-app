# Binding register.
R2.register_binding("MY_R2")
KV.register_binding("MY_KV")
D1.register_binding("DB")
WorkersAI.register_binding("AI")

# --- ルート定義 ---

# Redirect to /index.html
get "/" do |c|
  c.redirect("/index.html")
end

# hello world
get "/hello" do |c|
  c.text("Hello from Ruby Hibana ⚡")
end

# html sample
get "/sample.html" do |c|
  c.html("<h1>Hello Hibana! ⚡</h1>")
end

# json sample.
get  "/sample.js" do |c|
  c.json({name: "Hiroe", age: 50})
end

# GET query sample. /query?name=Mike&age=20
get "/query" do |c|
  name = c.query["name"]
  age = c.query["age"]
  c.text("Name: #{name}, Age: #{age}")
end

# POST sample.
# exp:
#   curl -i -X POST "http://localhost:8787/echo" -H "Content-Type: application/json" -d '{"name":"Shin","age":50}'
#   curl -i -X POST "http://localhost:8787/echo" -H "Content-Type: application/x-www-form-urlencoded" --data 'foo=bar&foo=baz&age=50'
#   curl -i -X POST "http://127.0.0.1:8787/echo" -H "Content-Type: text/plain" --data 'just text body'
post "/echo" do |c|
  c.json(
    content_type: c.content_type,
    params: c.params,
    json_body: c.json_body,
    form_body: c.form_body,
    raw_body: c.raw_body,
  )
end

# 404 NotFound sample.
get "/hoge" do |c|
  c.status = 404
  c.text("hoge not found.")
end

# 404 NotFound sample.
get "/tara" do |c|
  c.text("tara not found", status: 404)
end

# Cloudflare KV sample.
get "/kv" do |c|
  key = "ruby-kv-key"
  value = "Hello from separated KV functions!"

  kv = c.env(:MY_KV)
  kv.put(key, value)
  read_value = kv.get(key)

  c.text("Wrote '#{value}' to KV. Read back: '#{read_value}'")
end

# Cloudflare D1 sample.
get "/d1" do |c|
  db = c.env(:DB)
  result = db.prepare("SELECT * FROM posts WHERE id = ?").bind(1).first
  c.text(result)
end

# Cloudflare R2 sample.
get "/r2" do |c|
  key = "ruby-r2-key"
  value = "Hello from R2 sample!"

  bucket = c.env(:MY_R2)
  bucket.put(key, value)
  read_value = bucket.get(key).text

  c.text("Wrote '#{value}' to R2. Read back: '#{read_value}'")
end

# HTTP GET リクエストのサンプル
get "/http-get" do |c|
  response = Http.get("https://jsonplaceholder.typicode.com/todos/1")
  c.json(
    status: response.status,
    body: JSON.parse(response.body),
  )
end

# HTTP POST リクエストのサンプル
post "/http-post" do |c|
  response = Http.post(
    "https://httpbin.org/post",
    json: { name: "Ruby Worker", role: "client" },
  )
  c.json(
    status: response.status,
    body: JSON.parse(response.body)["json"],
  )
end

#
# Workers AI サンプル
# models: https://developers.cloudflare.com/workers-ai/models/
#

# llama sample.
get "/ai-demo-llama" do |c|
  ai = c.env(:AI)
  prompt = "What is Cloudflare Workers AI ?"
  model = "@cf/meta/llama-3.1-8b-instruct-fast"

  result = ai.run(
    model: model,
    payload: {
      prompt: prompt,
      temperature: 0.8,
      max_output_tokens: 30,
    },
  )
  c.json({prompt: prompt, result: result})
rescue WorkersAI::Error => e
  c.json({ error: e.message, details: e.details }, status: 500)
end

# gpt-oss sample
get "/ai-demo-gpt-oss" do |c|
  ai = c.env(:AI)
  prompt = "What is Cloudflare Workers AI ?"
  model = "@cf/openai/gpt-oss-20b"

  result = ai.run(
    model: model,
    payload: {
      input: prompt,
      reasoning: {
        effort: "low",
        summary: "auto"
      }
    },
  )
  c.json({prompt: prompt, result: result})
rescue WorkersAI::Error => e
  c.json({ error: e.message, details: e.details }, status: 500)
end
