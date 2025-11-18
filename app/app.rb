# frozen_string_literal: true

require "json"
require "js"
require "securerandom"

D1.register_binding("DB") 

# Redirect to /index.html
get "/" do |c|
  c.redirect("/index.html")
end

# hello world
get "/hello" do |c|
  c.text("Hello from Ruby WASM")
end

# Cloudflare D1 sample.
get "/d1" do |c|
  db = c.env(:DB)
  db.prepare("DELETE FROM posts").run

  insert_stmt = db.prepare(<<~SQL)
    INSERT INTO posts (user_id, title, status, views)
    VALUES (?, ?, ?, ?)
  SQL
  insert_stmt.bind(1, "Sample post #{SecureRandom.hex(4)}", "draft", 0).run

  row = db.prepare("SELECT * FROM posts ORDER BY id DESC LIMIT 1").first
  c.text(row ? JSON.generate(row) : "posts テーブルにデータがありません")
end

# ORM mapper sample.
get "/orm/sample" do |c|
  db = c.env(:DB)
  sample_user_id = 999

  db.prepare(<<~SQL)
    INSERT OR IGNORE INTO users (id, name, email)
    VALUES (?, ?, ?)
  SQL
    .bind(sample_user_id, "ORM Sample User", "orm-sample@example.com")
    .run

  demo_post = nil
  begin
    demo_post = Post.create!(
      user_id: sample_user_id,
      title: "ORM sample #{SecureRandom.hex(3)}",
      status: "draft",
    )
    demo_post.update!(status: "published", views: demo_post.views + 1)

    latest_posts = Post.order(id: :desc).limit(3).map do |post|
      {
        id: post.id,
        title: post.title,
        status: post.status,
        views: post.views,
      }
    end

    payload = {
      created: demo_post.as_json,
      published_count: Post.published.count,
      latest: latest_posts,
    }
    c.json(payload)
  ensure
    demo_post&.destroy
    Post.where(user_id: sample_user_id).delete_all
  end
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
