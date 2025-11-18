# Redirect to /index.html
get "/" do |c|
  c.redirect("/index.html")
end

# hello world
get "/hello" do |c|
  c.text("Hello from Ruby WASM")
end

# html sample
get "/sample.html" do |c|
  c.html("<h1>Hello Cloudflare Workers!</h1>")
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
