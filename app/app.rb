# frozen_string_literal: true

require "json"
require "js"
require "securerandom"

# Binding register.
R2.register_binding("MY_R2")
KV.register_binding("MY_KV")
D1.register_binding("DB")
WorkersAI.register_binding("AI")


# Redirect to /index.html
get "/" do |c|
  c.redirect("/index.html")
end

# hello world
get "/hello" do |c|
  c.text("Hello Hibana ⚡")
end

# Path parameter sample
get "/post/:year/:month/:day" do |c|
  year = c.params[:year]
  month = c.params[:month]
  day = c.params[:day]
  c.text("#{year}-#{month}-#{day}")
end

# GET query sample. /query?name=Mike&age=20
get "/query" do |c|
  name = c.query["name"]
  age = c.query["age"]
  c.text("Name: #{name}, Age: #{age}")
end

# Post body echo sample
post "/echo" do |c|
  c.json(c.json_body)
end

# Cloudflare D1 sample.
get "/d1" do |c|
  db = c.env(:DB)
  result = db.prepare("SELECT * FROM posts WHERE id = ?").bind(1).first
  c.json(result)
end

get "/d1-insert" do |c|
  db = c.env(:DB)
  db.prepare("DELETE FROM posts").run
  db.prepare("DELETE FROM users").run

  db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)")
    .bind(1, "ORM Sample User", "orm-sample@example.com")
    .run

  db.prepare("INSERT INTO posts (id, user_id, title, status) VALUES (?, ?, ?, ?)")
    .bind(1, 1, "Demo post from /d1-insert", "draft")
    .run

  db.prepare("UPDATE posts SET status = ?, views = ? WHERE id = ?").bind("published", 1001, 1).run

  c.json({ inserted_id: 1 })
end

# ORM mapper sample.
get "/orm/sample" do |c|
  posts = Post
    .published
    .where("views >= ?", 1_000)
    .order(views: :desc)
    .limit(20)

  c.json(posts.map(&:as_json))
end

# gpt-oss sample
get "/ai-demo-gpt-oss" do |c|
  ai = c.env(:AI)
  prompt = "Cloudflare Workers AIとはなんですか？ 日本語でわかりやすく教えて"
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

get "/template" do |c|
  c.render("index", name: "Hibana", age: 50)
end

# Cloudflare R2 sample.
get "/r2" do |c|
  bucket = c.env(:MY_R2)

  key = "my-key"
  value = "This is R2 sample."

  # 保存
  bucket.put(key, value)

  # 参照
  value = bucket.get(key).text

  c.text("R2 Object [key:#{key}]  [value:#{value}]")
end

# html sample
get "/sample.html" do |c|
  c.html("<h1>Hello Cloudflare Workers!</h1>")
end

# json sample.
get  "/sample.js" do |c|
  c.json({name: "Hiroe", age: 50})
end

# simple queue enqueue sample
get "/jobs" do |c|
  payload = {
    id: SecureRandom.uuid,
    body: c.raw_body.to_s,
  }
  c.env(:TASK_QUEUE).enqueue(payload, metadata: { source: "demo" })
  c.text("Queued #{payload[:id]}", status: 202)
end

queue binding: :TASK_QUEUE do |batch, ctx|
  batch.each do |message|
    puts "[queue] Processing #{message.id} from #{batch.queue}"
    puts "[queue] Body: #{message.body.inspect}"
    message.ack!
  rescue => error
    warn "[queue] Failed to process #{message.id}: #{error.message}"
    message.retry!(delay_seconds: 30)
  end
end

get "/post/:id" do |c|
  post_id = c.params[:id]
  c.text("ID: #{post_id}")
end

get "/post/:year/:month/:day" do |c|
  year = c.params[:year]
  month = c.params[:month]
  day = c.params[:day]
  c.text("#{year}-#{month}-#{day}")
end

get "/neko/*tail" do |c|
  tail = c.params[:tail]
  c.text(tail)
end

get "/rewrite" do |c|
  rewriter = HTMLRewriter.new

  rewriter.on("h1") do |element|
    element.set_inner_content("✨ HTMLRewriter で書き換えました")
  end

  rewriter.on("p.highlight") do |element|
    element.append(" 🔥")
  end

  rewriter.on_document do |doc|
    doc.after("<!-- rewritten at #{Time.now.utc} -->")
  end

  original = c.html(<<~HTML)
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>Original Title</title>
      </head>
      <body>
        <h1>Original Heading</h1>
        <p class="highlight">Original body</p>
      </body>
    </html>
  HTML

  rewriter.transform(original)
end

get "/posts/crud-demo" do |c|
  Post.create!(
    user_id: 1,
    title: "CRUD demo from Hibana",
    status: "draft",
  )
  created = Post.order(id: :desc).limit(1).first
  raise Hibana::ORM::RecordNotFound, "Failed to load created post" unless created
  created_snapshot = created.as_json

  created.update!(status: "published", views: created.views + 1)
  updated = Post.find(created.id)

  selected = Post.where(id: created.id).select(:id, :user_id, :title, :status, :views).first
  Post.delete(created.id)

  c.json(
    create: created_snapshot,
    update: updated.as_json,
    select: selected.as_json,
    delete: { id: created.id },
  )
end


get "/vectorize-demo" do |c|
  vectorize = c.env(:VECTORIZE)
  ai = c.env(:AI)
  model = "@cf/baai/bge-m3" # 1024次元

  doc_text = "多言語のテキストをベクトル化して検索します。"
  doc_embed = ai.run(model: model, payload: { text: [doc_text] })
  doc_vector = doc_embed["data"][0]

  vectorize.upsert(
    vectors: [
      { id: "doc-1", values: doc_vector, metadata: { lang: "ja", note: "demo" } },
    ],
  )

  query_text = "このデモは何をしますか？"
  query_embed = ai.run(model: model, payload: { text: [query_text] })
  query_vector = query_embed["data"][0]

  result = vectorize.query(
    top_k: 2,
    vector: query_vector,
    include_metadata: true,
    include_values: false,
  )

   c.json(result[:matches])
end

get "/durable/counter" do |c|
  result = c.env(:COUNTER)
    .fetch(name: "global-counter")
    .json do
      post json: { action: "increment", amount: 2 }
    end

  c.json(result)
rescue Hibana::DurableObject::Error => e
  c.json({ error: e.message }, status: 500)
end

cron "9 15 * * *" do |event, c|
  time = event.scheduled_time
  key = "daily_report_#{time.year}-#{time.month}-#{time.day}"
  value = "Report for #{time.year}/#{time.month}/#{time.day}"

  bucket = c.env(:MY_R2)
  bucket.put(key, value)
end

cron "*" do |event, _ctx|
  puts "Cron event: #{event.cron}"
end
