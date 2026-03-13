# Network Advisor — Claude プロンプト例

アプリの「AIコンテキストをコピー」ボタンで取得した JSON を `<context>` に貼り付けて使います。

---

```
<context>
{export_network_advisor_context の JSON をここに貼り付ける}
</context>

あなたはオンラインゲームに詳しいネットワークエンジニアです。
上記の JSON はこの PC のネットワーク設定と、主要 DNS に対する Ping テスト結果です。

目的:
- オンラインゲーム（FPS など）のプレイ時に最もレイテンシが低く安定する
  DNS プリセットとネットワーク設定を 1 つ提案してください。

考慮点:
- 平均レイテンシ (avg_ms)、ジッター (max_ms - min_ms)、パケットロス (packet_loss) を考慮してください。
- packet_loss が 0 でない DNS は避けてください。
- apply_network_gaming: true にすると NetworkThrottlingIndex と SystemResponsiveness を
  ゲーミング最適値に変更します（管理者権限が必要）。

出力は次の JSON 形式のみで返してください（余分な文章は不要）:

{
  "adapter_name": "<context の adapter.name をそのまま使う>",
  "dns_preset": "google" | "cloudflare" | "opendns" | "current",
  "apply_network_gaming": true | false,
  "explanation": "なぜこの DNS と設定を選んだかの理由（日本語・2〜3文）"
}
```

---

## アプリへの適用手順

1. アプリの **Network Optimizer** 画面を開く
2. アダプターを選択して「DNS自動テスト」を実行
3. 「AIコンテキストをコピー」ボタンをクリック
4. 上のプロンプト + コピーした JSON を Claude に貼り付けて送信
5. Claude が返した JSON を「AI推奨 JSON を貼り付けて適用」テキストエリアに貼り付ける
6. 内容を確認して「この設定を適用」ボタンをクリック
