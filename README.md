# Cloudflare Workers Ruby Template

This project is a template for experimenting with a Hono・Sinatra-like Ruby framework running on Cloudflare Workers. It bundles Ruby WASM together with Cloudflare bindings (KV / D1 / R2 / Workers AI) so you can explore the stack quickly.

To scaffold a new project, use `npm create hibana@latest <project-name>` rather than cloning this repository directly.

---

## Getting Started

- Install dependencies.
  - `npm install`
- Launch the local development server.
  - `npx wrangler dev`
  - Visit `http://127.0.0.1:8787` to explore the routes.
- Build the project.
  - `npx wrangler build`
- Deploy to Cloudflare Workers.
  - `npx wrangler deploy`

## Routing and Application Logic

### Routing

Define your routes in `app/app.rb`. The simplest “Hello World” looks like this:

```ruby
get "/" do |c|
  c.text("Hello from Ruby WASM")
end
```

Returning HTML or JSON is just as straightforward:

```ruby
get "/sample.html" do |c|
  c.html("<h1>Hello Cloudflare Workers!</h1>")
end

get "/sample.js" do |c|
  c.json({ name: "Hiroe", age: 50 })
end
```

### Handling Query Parameters and POST Data

Working with query parameters and request bodies keeps the same style:

```ruby
get "/query" do |c|
  name = c.query["name"]
  age = c.query["age"]
  c.text("Name: #{name}, Age: #{age}")
end

post "/echo" do |c|
  content_type = c.content_type
  data = c.form_body
  # data = c.json_body
  # data = c.raw_body

  c.text("get post data")
end
```

### Template Rendering (ERB)

Place your ERB files under the `templates/` directory. Layouts live under `templates/layouts/` and automatically wrap `c.render` responses (default: `layouts/application.html.erb`).

```
templates/
  index.html.erb
  layouts/
    application.html.erb
```

Render a template from any route:

```ruby
get "/" do |c|
  c.render("index", name: "Hibana", age: 50)
end
```

- Omit the extension and Hibana will look for `.html.erb` (falling back to `.erb`).
- Pass `layout: false` to skip the default layout, or `layout: "layouts/marketing"` to choose another file.
- `render_to_string("users/show", locals: { name: "Hiroe" })` is available when you need the HTML without returning a response immediately.

`npm run build:generated` (automatically executed before `dev`, `deploy`, and `test`) keeps `src/generated/template-assets.ts` in sync with your ERB files so Wrangler bundles them.

### Serving Static Assets

Place files that should be served as-is under the `public/` directory. Any request that doesn’t match a Ruby route falls back to the static registry and returns the asset with an appropriate `Content-Type`.

```
public/
  index.html
  assets/
    app.css
    logo.svg
```

- `/public/index.html` → `GET /index.html`
- `/public/assets/logo.svg` → `GET /assets/logo.svg`
- `npm run build:generated` also regenerates `src/generated/static-assets.ts`, so static files are bundled automatically before dev/build/deploy/test.

Static files coexist with ERB templates—use templates for dynamic HTML (`c.render`) and `public/` for CSS, JS, images, or raw HTML pages.

## Cloudflare Bindings

The template ships with sample integrations for Cloudflare KV, D1, and R2—just reference the binding name to call them from Ruby.

### KV

```ruby
get "/kv" do |c|
  key = "ruby-kv-key"
  value = "Hello from separated KV functions!"

  kv = c.env(:MY_KV)
  kv.put(key, value)
  read_value = kv.get(key)

  c.text("Wrote '#{value}' to KV. Read back: '#{read_value}'")
end
```

### D1

```ruby
get "/d1" do |c|
  db = c.env(:DB)
  result = db.prepare("SELECT * FROM posts WHERE id = ?").bind(1).first
  c.text(result)
end
```

### R2

```ruby
get "/r2" do |c|
  key = "ruby-r2-key"
  value = "Hello from R2 sample!"

  bucket = c.env(:MY_R2)
  bucket.put(key, value)
  read_value = bucket.get(key).text

  c.text("Wrote '#{value}' to R2. Read back: '#{read_value}'")
end
```

### Workers AI

You can also integrate with Workers AI. Each model expects different payload fields, so adjust the arguments accordingly.

Sample using `@cf/meta/llama-3.1-8b-instruct-fast`:

```ruby
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
  c.json({ prompt: prompt, result: result })
rescue WorkersAI::Error => e
  c.json({ error: e.message, details: e.details }, status: 500)
end
```

Sample using `@cf/openai/gpt-oss-20b`:

```ruby
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
        summary: "auto",
      },
    },
  )
  c.json({ prompt: prompt, result: result })
rescue WorkersAI::Error => e
  c.json({ error: e.message, details: e.details }, status: 500)
end
```

### HTTP Requests to External Services

The built-in `Http` client lets you call external APIs through Cloudflare Workers’ `fetch`. It exposes synchronous-looking methods inside Ruby while delegating the actual request to TypeScript.

```ruby
# GET example
get "/http-get" do |c|
  response = Http.get("https://jsonplaceholder.typicode.com/todos/1")
  c.json(body: JSON.parse(response.body), status: response.status)
end

# POST example
post "/http-post" do |c|
  response = Http.post(
    "https://httpbin.org/post",
    json: { name: "Ruby Worker", role: "client" },
  )
  c.json(body: JSON.parse(response.body)["json"], status: response.status)
end
```

See `app/app.rb` or `app/app_all_sample.rb` for additional details.

---

## Database Migrations (D1)

First create the database via Wrangler (replace the name if needed):

```bash
npx wrangler d1 create wasm-d1-test
```

Migrations live under `migrations/wasm-d1-test/`. Wrangler looks for `migrations/<database_name>/`, so the directory name matches the database registered in `wrangler.toml`.

The starter file `0001_create_posts_table.sql` provisions the sample `posts` table used by `/d1`.

- Not using D1? Simply skip the migration commands or remove the `migrations/` directory.

- Run: `npm run db:migrate`
- Create new migration: `npm run db:migration:new "add_comments_table"`

Edit the generated SQL and re-run the apply command whenever you need schema changes.

---

## Helpers

Place Ruby helper files under `app/helpers`. During development and builds, the manifest at `src/generated/helper-scripts.ts` is regenerated automatically, and every helper is evaluated when the Ruby VM boots. If you need to refresh the manifest manually, run `npm run build:helpers`.

---

This README is meant to give you a feel for the template rather than document every detail. Explore the files and sample code to tailor the project to your needs.
