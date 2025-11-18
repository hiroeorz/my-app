# TypeScript ↔ Ruby バインディング概要

Cloudflare Workers 上で動作する TypeScript ランタイムと、組み込み Ruby アプリケーションがどのように連携しているかを説明します。

## 主要コンポーネント

- `src/ruby-runtime.ts`: Ruby VM の起動、ブリッジ関数の登録、リクエスト処理を担当。
- `app/hibana/host_bridge.rb`: Ruby から TypeScript 関数へ到達するためのクラスアクセサを公開。
- 各クライアント (`app/hibana/kv_client.rb`, `app/hibana/d1_client.rb`, `app/hibana/r2_client.rb` など): 直接 JavaScript に触れず、ブリッジ経由で機能を利用。

## 初期化の流れ

1. `handleRequest` が `setupRubyVM` (`src/ruby-runtime.ts:62`) を呼び、WASM ベースの Ruby VM を生成。
2. VM が `app/hibana/host_bridge.rb` を `eval` し、`HostBridge` モジュールを定義 (`src/ruby-runtime.ts:78`)。
3. `registerHostFunctions` が `globalThis` に JavaScript 補助関数を定義（未定義の場合のみ） (`src/ruby-runtime.ts:165`)。
4. `vm.eval('require "js"')` を実行し、Ruby から JavaScript オブジェクトへアクセス可能にする (`src/ruby-runtime.ts:384`)。
5. `vm.wrap` 済みの各関数を `HostBridge` のアクセサに代入（例: `HostBridge.call("ts_call_binding=", vm.wrap(host.tsCallBinding))`）。

この初期化が完了すると、Ruby から `HostBridge` 経由で TypeScript 側にコールできる。

## 登録されるホスト関数

| Ruby アクセサ                     | JavaScript 補助関数         | 役割                                                                 |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `HostBridge.ts_call_binding`      | `host.tsCallBinding`        | 汎用的なバインディング／メソッド呼び出し（KV・R2・Workers AI など）。 |
| `HostBridge.ts_run_d1_query`      | `host.tsRunD1Query`         | Cloudflare D1 のプリペアドステートメントを実行。                      |
| `HostBridge.ts_http_fetch`        | `host.tsHttpFetch`          | `fetch` をラップし、リクエスト／レスポンスをシリアライズ。           |
| `HostBridge.ts_workers_ai_invoke` | `host.tsWorkersAiInvoke`    | Workers AI バインディングを安全に呼び出すための検証と整形。           |
| `HostBridge.ts_report_ruby_error` | `host.tsReportRubyError`    | Ruby で発生した例外を Worker のコンソールへ出力。                     |

各補助関数は、バインディングの存在確認や引数整形、戻り値の正規化を担う。

## 呼び出しの流れ（KV の例）

1. ルート内で `kv = c.env(:MY_KV)` のようにバインディングを取得 (`app/app.rb`)。
2. `KV::Namespace#put` が `HostBridge.call_async(@binding_name, :put, key, value)` を実行 (`app/hibana/kv_client.rb:7`)。
3. `HostBridge.call_async` が `ts_call_binding` が登録済みか確認し、`ts_call_binding.apply(...)` を呼ぶ (`app/hibana/host_bridge.rb:10`)。
4. `host.tsCallBinding` が `env` から対象バインディングとメソッドを取り出し、`Reflect.apply(targetMethod, target, args)` で元の `this` を維持したまま実行 (`src/ruby-runtime.ts:168`)。
5. JavaScript 側の戻り値が Promise であれば Ruby 側で `await` し、`undefined` の場合は `null` に変換して渡す。

この仕組みにより、Ruby からは同期的な書き味で非同期 API を扱える。

## 特殊なケース

- **D1**: `D1::PreparedStatement#execute` が SQL 情報をまとめて `HostBridge.run_d1_query` に渡し、JavaScript 側で `prepare → bind → first/all/run` を実行。結果は JSON 文字列として Ruby に返る (`src/ruby-runtime.ts:194`)。
- **HTTP Fetch**: `host.tsHttpFetch` がリクエストをパースし、結果を JSON オブジェクト（エラー時も含む）として返すため、Ruby は `ok` フラグで判定できる。
- **Workers AI**: `host.tsWorkersAiInvoke` がペイロードを検証し、モデル名や追加引数を Workers AI の期待どおりに組み立ててから呼び出す。

## エラー報告

`dispatch` 中に Ruby が例外を投げると、`routing.rb` が `HostBridge.report_ruby_error` にエラー情報の JSON を渡す。`host.tsReportRubyError` はクラス名・メッセージ・バックトレースをログに出力し、Ruby 側は汎用的な 500 応答を返す (`src/ruby-runtime.ts:353`)。

## 補足メモ

- `HostBridge` はモジュールであり、インスタンス化はしていない。
- TypeScript 側でホスト関数を 1 度だけインストールし、再登録は行わない。
- `Reflect.apply` を使うことで、Proxy 経由でも正しい呼び出しセマンティクスを保てる。
- 補助関数ごとに戻り値の形が異なるため、Ruby 側クライアントがそれぞれに合わせた扱い方を定義している。
