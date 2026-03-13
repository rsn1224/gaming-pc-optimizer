/**
 * プロセス知識ベース
 *
 * process.rs の BLOATWARE_PROCESSES (33種) に対応するアノテーション定義です。
 * 将来的に Claude API でこのリストを自動拡充・更新することを想定しています。
 *
 * 追加・編集方法:
 *   - exe_name は process.rs の BLOATWARE_PROCESSES と大文字小文字を完全一致させる
 *   - risk_level: "safe_to_kill" | "caution" | "keep"
 *   - このファイルは TypeScript モジュールですが、JSONへの移行も容易な構造です
 */

import type { ProcessAnnotation } from "@/types";

export const PROCESS_KNOWLEDGE: ProcessAnnotation[] = [
  {
    exe_name: "OneDrive.exe",
    display_name: "Microsoft OneDrive",
    description: "Microsoftのクラウドストレージ同期クライアント。バックグラウンドでファイルをアップロード・ダウンロードするため、ゲーム中はディスクI/Oと帯域を消費します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。再起動後に自動起動します。",
  },
  {
    exe_name: "Cortana.exe",
    display_name: "Cortana（音声アシスタント）",
    description: "Windowsの音声・テキスト検索アシスタント。常時バックグラウンドで音声認識待機しており、CPU・メモリを消費します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。音声検索が不要なら常時停止でも問題なし。",
  },
  {
    exe_name: "SearchUI.exe",
    display_name: "Windows 検索UI",
    description: "Windowsスタートメニューの検索機能のUIプロセス。Cortanaと連携してインデックス検索を処理します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。スタートメニュー検索が一時的に使えなくなります。",
  },
  {
    exe_name: "SearchApp.exe",
    display_name: "Windows 検索アプリ",
    description: "Windows 11の検索アプリプロセス。SearchUI.exeの後継で、バックグラウンドインデックス更新を行います。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。検索UIが一時的に起動しなくなります。",
  },
  {
    exe_name: "YourPhone.exe",
    display_name: "スマートフォン連携",
    description: "AndroidスマートフォンとWindowsを連携するアプリ。通知のミラーリングやSMSの表示を担当します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。スマートフォンの通知がPC上で確認できなくなります。",
  },
  {
    exe_name: "PhoneExperienceHost.exe",
    display_name: "スマートフォン連携ホスト",
    description: "YourPhone.exeのホストプロセス。スマートフォン連携機能のバックエンドを担当します。",
    risk_level: "safe_to_kill",
    recommended_action: "YourPhone.exeと合わせて停止推奨。",
  },
  {
    exe_name: "GameBarPresenceWriter.exe",
    display_name: "Xbox Game Bar 存在管理",
    description: "Xbox Game Barのオーバーレイ・スクリーンショット・録画機能のバックグラウンドプロセス。ゲームを検出して常駐します。",
    risk_level: "safe_to_kill",
    recommended_action: "Game Barを使わないなら停止推奨。オーバーレイ・Win+G が一時的に利用不可になります。",
  },
  {
    exe_name: "SkypeApp.exe",
    display_name: "Skype",
    description: "MicrosoftのビデオチャットアプリのUWP版。通話・メッセージの受信待機でCPUとメモリを消費します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。通話中の場合は停止しないでください。",
  },
  {
    exe_name: "SkypeBackgroundHost.exe",
    display_name: "Skype バックグラウンドホスト",
    description: "SkypeのUWPバックグラウンドタスクホスト。着信通知のために常駐します。",
    risk_level: "safe_to_kill",
    recommended_action: "SkypeApp.exeと合わせて停止推奨。",
  },
  {
    exe_name: "Teams.exe",
    display_name: "Microsoft Teams",
    description: "Microsoftのビジネスチャット・会議アプリ。アイドル時でも数百MBのメモリを消費し、CPUを定期的に使用します。",
    risk_level: "caution",
    recommended_action: "会議・チャット中は停止しないでください。使用中でなければ停止推奨。",
  },
  {
    exe_name: "Spotify.exe",
    display_name: "Spotify",
    description: "音楽ストリーミングアプリ。再生中はネットワーク帯域とCPUを使用します。バックグラウンド再生中の停止は音楽が切れます。",
    risk_level: "caution",
    recommended_action: "音楽を聴きながらゲームする場合は維持。不要なら停止推奨。",
  },
  {
    exe_name: "SpotifyWebHelper.exe",
    display_name: "Spotify Webヘルパー",
    description: "Spotifyのブラウザ連携機能のヘルパープロセス。ブラウザからSpotifyを操作するために使用されます。",
    risk_level: "safe_to_kill",
    recommended_action: "ほぼ不要なため停止推奨。Spotify本体の動作には影響しません。",
  },
  {
    exe_name: "iTunesHelper.exe",
    display_name: "iTunes ヘルパー",
    description: "AppleのiTunesが起動時に自動起動するヘルパー。iOSデバイスの接続検出のために常駐します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。iOSデバイスを接続しない限り不要です。",
  },
  {
    exe_name: "AdobeUpdateService.exe",
    display_name: "Adobe 自動更新サービス",
    description: "Adobeアプリのバックグラウンドアップデートチェッカーサービスプロセスです。定期的にサーバーへ問い合わせます。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。Adobeアプリ自体の動作には影響しません。",
  },
  {
    exe_name: "AdobeARM.exe",
    display_name: "Adobe Acrobat Update Manager",
    description: "Adobe Acrobatの自動更新管理プロセス（ARM = Acrobat Update Manager）。バックグラウンドで更新をチェックします。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。更新チェックを一時停止するだけで安全です。",
  },
  {
    exe_name: "CCXProcess.exe",
    display_name: "Adobe Creative Cloud",
    description: "Adobe Creative Cloudのランチャー・同期プロセス。ファイル同期とアプリ更新のためにネットワークとCPUを使用します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。Creative Cloudを使わない間は不要です。",
  },
  {
    exe_name: "jusched.exe",
    display_name: "Java アップデートスケジューラー",
    description: "OracleのJava自動更新スケジューラー（JRE Update Scheduler）。定期的に最新JREの更新をチェックします。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。Java更新のチェックを一時停止するだけで安全です。",
  },
  {
    exe_name: "Dropbox.exe",
    display_name: "Dropbox",
    description: "クラウドストレージサービスのデスクトップクライアント。バックグラウンドで同期を行い、ディスクI/OとCPUを使用します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。再起動後に自動起動します。",
  },
  {
    exe_name: "GoogleDriveSync.exe",
    display_name: "Google ドライブ",
    description: "Googleのクラウドストレージ同期クライアント。ファイルの変更を監視し、バックグラウンドで同期します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。再起動後に自動起動します。",
  },
  {
    exe_name: "iCloudServices.exe",
    display_name: "iCloud サービス",
    description: "AppleのiCloudとWindowsを連携するサービス。写真・ファイルのバックグラウンド同期を担当します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。iOSデバイスとの同期が一時停止されます。",
  },
  {
    exe_name: "Discord.exe",
    display_name: "Discord",
    description: "ゲーマー向けボイスチャット・メッセージアプリ。ゲームオーバーレイ機能もあり、通話中は停止するとボイスチャットが切断されます。",
    risk_level: "caution",
    recommended_action: "ボイスチャット使用中は停止しないでください。使用しないなら停止推奨。",
  },
  {
    exe_name: "Slack.exe",
    display_name: "Slack",
    description: "ビジネスチャットアプリ。Electronベースで起動するとメモリを多く消費します。",
    risk_level: "caution",
    recommended_action: "仕事中は維持推奨。ゲームに専念するなら停止OK。",
  },
  {
    exe_name: "Telegram.exe",
    display_name: "Telegram",
    description: "メッセージングアプリ。比較的軽量ですが、バックグラウンドで通知を受信するために常駐します。",
    risk_level: "caution",
    recommended_action: "通知が不要なら停止推奨。ゲーム中でも軽量なため維持も選択肢。",
  },
  {
    exe_name: "WhatsApp.exe",
    display_name: "WhatsApp",
    description: "メッセージング・通話アプリ。バックグラウンドで通知を受信するために常駐します。",
    risk_level: "caution",
    recommended_action: "通知が不要なら停止推奨。通話中は停止しないでください。",
  },
  {
    exe_name: "MicrosoftEdgeUpdate.exe",
    display_name: "Microsoft Edge 自動更新",
    description: "Microsoft Edgeブラウザの自動更新チェッカー。定期的にMicrosoftサーバーへ更新確認のリクエストを送信します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。Edge本体の動作には影響しません。",
  },
  {
    exe_name: "GoogleUpdate.exe",
    display_name: "Google 自動更新",
    description: "Chrome・Google製アプリの自動更新チェッカー。定期的にGoogleサーバーへ更新確認を行います。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。Chrome本体の動作には影響しません。",
  },
  {
    exe_name: "HPTouchpointAnalyticsService.exe",
    display_name: "HP タッチポイント分析サービス",
    description: "HP製PCのテレメトリ（使用状況収集）サービス。HPサーバーへ使用データを定期送信します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中・常時停止推奨。ゲームに関係なく不要なサービスです。",
  },
  {
    exe_name: "ETDCtrl.exe",
    display_name: "ASUS/Elantech タッチパッドドライバー",
    description: "ASUSノートPC等に搭載されるElan製タッチパッドのドライバープロセス。タッチパッドの操作感・ジェスチャー設定を管理します。",
    risk_level: "caution",
    recommended_action: "マウス使用中は停止OK。ノートPCのタッチパッドを使う場合は維持推奨。",
  },
  {
    exe_name: "SynTPEnhService.exe",
    display_name: "Synaptics タッチパッドサービス",
    description: "Synaptics製タッチパッドのドライバーサービス。多くのノートPCに搭載されており、タッチパッドの拡張機能を提供します。",
    risk_level: "caution",
    recommended_action: "マウス使用中は停止OK。タッチパッド使用時は維持推奨。",
  },
  {
    exe_name: "TabTip.exe",
    display_name: "タッチキーボード（TabTip）",
    description: "Windowsのタッチスクリーン向けオンスクリーンキーボードプロセス。タブレットモードや画面キーボードが必要な場合に使用します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。物理キーボード使用中は不要です。",
  },
  {
    exe_name: "CalculatorApp.exe",
    display_name: "Windows 電卓",
    description: "Windows標準の電卓アプリのバックグラウンドプロセス。閉じた後も一定時間バックグラウンドで残ります。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。必要になれば再度起動できます。",
  },
  {
    exe_name: "People.exe",
    display_name: "People アプリ（連絡先）",
    description: "Windowsの連絡先管理アプリのバックグラウンドプロセス。タスクバーの連絡先ピン留め機能に使用されます。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。連絡先アプリが一時的に使用不可になります。",
  },
  {
    exe_name: "HxTsr.exe",
    display_name: "Windowsメール バックグラウンド同期",
    description: "Windows標準メールアプリのバックグラウンド同期プロセス（HxTsr = Host eXchange Transport Service Runtime）。メールの受信確認を定期実行します。",
    risk_level: "safe_to_kill",
    recommended_action: "ゲーム中は停止推奨。メール受信の即時通知が一時停止されます。",
  },
];

/**
 * exeファイル名からアノテーションを取得するユーティリティ
 * 大文字小文字は無視します
 */
export function findAnnotation(exeName: string): ProcessAnnotation | undefined {
  const lower = exeName.toLowerCase();
  return PROCESS_KNOWLEDGE.find((k) => k.exe_name.toLowerCase() === lower);
}
