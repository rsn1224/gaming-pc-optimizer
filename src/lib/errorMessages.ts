/**
 * Rustバックエンドから返ってくるエラー文字列をユーザー向けの日本語メッセージに変換する。
 * マップにないエラーはそのまま返す（フォールバック）。
 */

const ERROR_MAP: Record<string, string> = {
  // 権限・管理者
  "access is denied": "管理者権限が必要です。右クリック→「管理者として実行」でアプリを起動してください。",
  "access denied": "管理者権限が必要です。アプリを管理者として再起動してください。",
  "elevation required": "この操作には管理者権限が必要です。",
  "requires administrator": "管理者として起動し直してください。",

  // ネットワーク
  "network path was not found": "ネットワーク接続を確認してください。",
  "the operation timed out": "接続がタイムアウトしました。ネットワークを確認してください。",
  "connection refused": "接続が拒否されました。",

  // ファイル・ディスク
  "no space left on device": "ディスクの空き容量が不足しています。不要なファイルを削除してください。",
  "not found": "対象が見つかりませんでした。すでに削除または変更された可能性があります。",
  "file not found": "ファイルが見つかりませんでした。",
  "the system cannot find the file specified": "指定されたファイルが存在しません。",

  // プロセス
  "no such process": "プロセスが存在しません。すでに終了している可能性があります。",
  "process not found": "対象プロセスが見つかりませんでした。",

  // nvidia-smi
  "nvidia-smi not found": "nvidia-smi が見つかりません。NVIDIA ドライバーが正しくインストールされているか確認してください。",
  "unable to determine the device handle": "GPU デバイスへのアクセスに失敗しました。ドライバーを再インストールしてください。",

  // セッション・ロールバック
  "session not found": "セッションが見つかりませんでした。すでに削除されている可能性があります。",
  "snapshot not found": "スナップショットが見つかりません。復元できるデータがありません。",
  "restore failed": "復元に失敗しました。再度お試しいただくか、手動で設定を元に戻してください。",
};

/**
 * エラー値をユーザー向けメッセージに変換する。
 * @param err - `catch (e)` で受け取った値
 * @param fallback - マップにもパターンにも一致しない場合のデフォルト文言
 */
export function toUserMessage(err: unknown, fallback = "予期しないエラーが発生しました。"): string {
  const raw = String(err).toLowerCase();

  for (const [key, msg] of Object.entries(ERROR_MAP)) {
    if (raw.includes(key.toLowerCase())) return msg;
  }

  return fallback;
}
