# Chart Playback リリース計画

## 現在の段階

試作版。

知り合いに触ってもらえる程度の Web 公開は可能だが、正式公開ではない。

現在の公開 URL:

```text
https://web-chart.stock-practice.workers.dev/
```

## 2026-07-02 時点の到達点

株価データの CSV 読み込みは、無料版・β版向けの最小範囲として実装済み。

現在は、アプリ側に用意した CSV だけでなく、ユーザーがブラウザから選択した CSV も読み込める。
読み込んだ CSV は、一時銘柄として表示でき、必要に応じて保存済み銘柄として管理できる。

これにより、Web アプリ本体は「過去チャートを読み込んで売買練習する」ための主要機能がかなり揃った状態になった。

## 2026-07-02 追加決定

- Webアプリ名とWebサイト名は `チャートプレイバック` に統一する。
- 英語表記は `Chart Playback` とする。
- 無料会員の保存済みCSV銘柄数は **10銘柄まで** とする。
- 後から無料会員の上限を減らすと不満が出やすいため、基本的に減らさない。変更する場合は増やす方向を優先する。
- ゲストはCSV銘柄追加不可とし、架空サンプル銘柄で主要機能を体験してもらう。
- プロモーションビデオは、公式サイトのトップページ最小版を作った直後に作る。ログイン実装やPro機能より前に進めてよい。
- `App.tsx` は 2026-07-02 時点で約8600行・約300KBあり、今後のCodex作業事故を避けるため、計画的なファイル分割を進める。

## 直近の優先順位

1. 現在のWebアプリを安定版として `git commit` / `git push` する。
2. 最新docsを反映して `docs/` をcommitする。
3. ゲスト・無料会員・Proの制限方針を確定する。
4. ゲスト用の架空サンプルデータを5〜6銘柄作る。
5. `D:\workspace\chart_playback_site` を作成し、公式サイト制作を始める。
6. 公式サイトのトップページ・使い方・CSVガイド・免責事項を最小構成で作る。
7. 30〜60秒のプロモーションビデオを作る。
8. `chart-playback.com` / `app.chart-playback.com` の独自ドメイン構成を準備する。
9. Cloudflare Pages / Workers で公式サイトとWebアプリを公開する。
10. Google Analytics を公式サイトとWebアプリの両方に入れる。
11. `Chart Playback 共通アカウント` の設計を固める。
12. 無料会員ログインを実装し、CSV追加とデータ取得ツールDLを無料会員以上に制限する。
13. ファイル分割は大規模に一括実行せず、計画を立てたうえで小さく進める。


## 現在できること

- `public/data` に配置した CSV からチャート表示。
- ブラウザから CSV を一時読み込みしてチャート表示。
- 読み込んだCSVを保存済み銘柄として保存。
- 保存済み銘柄はリロード後も銘柄選択に残る。
- 設定ダイアログの「銘柄管理」タブから保存済み銘柄を一覧管理。
- 同じコードの銘柄を保存する場合は、上書き、別銘柄として保存、キャンセルを選択。
- 複数銘柄切り替え。
- 日足 / 週足 / 月足。
- 1本送り、戻り。
- 表示本数と初期表示位置の設定。
- チャート外観設定。
- 移動平均線設定。
- 日本株以外の指数・為替・先物・仮想通貨向けの数量・通貨・倍率設定。
- 売買練習。
- 次の取引日の始値 / 当日の終値の約定タイミング設定。
- 建玉管理。
- FIFO 返済。
- 確定損益、含み損益、総合損益。
- 売買ログ。
- 売買ログの個別削除と建玉復元。
- 建玉ログと返済ログの対応ハイライト。
- 勝敗集計。
- 引き分け基準設定。
- 損益と勝敗の表示/非表示。
- チャートメモ。
- ペイント練習。
- ペイントテキスト入力改善。
- ペイントの Ctrl+Z / やり直し対応。
- 本数計測。
- PNG 保存。
- 売買ログ CSV 出力。
- 日本語 / 英語切り替え。
- 効果音 ON/OFF。

## 無料版・β版として残っている大きな機能

有料向け機能を除くと、大きな未実装は主に以下。

1. 公開サイトの使い方ページ、免責事項ページの整備。
2. スマホ向け UI の本格最適化。
3. 会員制導入時のゲスト・無料会員・有料会員の制限設計。

現状の「CSV からチャート表示」は、アプリ側に用意した CSV の読み込みと、ユーザーが選択した CSV の一時読み込みに対応している。

ユーザー自身が読み込んだ CSV に対して、銘柄名・コード・通貨・1玉あたり数量・倍率などを設定して管理する最小機能は実装済み。

## 次に進める方針 / 公開前整理

練習結果サマリーと音素材差し替えは、今すぐ無料版の残タスクとして急がない。

CSV 読み込みと銘柄管理の無料版向け最小範囲は実装済みのため、次は公開前の動作確認・使い方説明・免責事項の整備を優先する。

ここまでに完了した大きな作業は以下。

1. CSV・銘柄管理に関係する部分だけ、最小限のファイル分割を行う。実施済み。
2. ブラウザから CSV ファイルを一時読み込みし、チャート表示できるようにする。実施済み。
3. 読み込んだ CSV の銘柄情報を設定できるようにする。実施済み。
4. 読み込んだ CSV と銘柄情報を保存できるようにする。実施済み。
5. 保存済み銘柄の削除・名前変更・再インポートをできるようにする。実施済み。
6. 保存済み銘柄を設定ダイアログの「銘柄管理」タブで一覧管理できるようにする。実施済み。
7. 同じコードの保存済み銘柄がある場合に、上書き・別保存・キャンセルを選べるようにする。実施済み。

大規模な App.tsx 全体リファクタではなく、CSV 読み込み・銘柄定義・保存まわりだけを先に分ける。

## 保留中の機能

### 音素材の差し替え

音素材は選定中のため保留。

現状の効果音 ON/OFF は維持する。

候補:

```text
https://soundeffect-lab.info/sound/button/
```

### 練習結果サマリー

通常練習では急いで実装しない。

練習結果サマリーは、有料版 / Pro 版の「真剣練習モード」とセットで実装する方針。

通常練習は、過去に戻れる・銘柄を変えられる・ログ削除できるため、厳密な成績サマリーとの相性が弱い。

真剣練習モードでは、以下を制限した上で結果サマリーを出す。

- 時間を戻せない。
- 途中で銘柄を変えられない。
- 売買ログを削除できない。
- 練習終了時に成績サマリーを表示する。
- 練習履歴を保存する。

## 公開前に最低限確認すること

- `npm run build` が通る。
- `npm run lint` が通る。
- 主要銘柄で CSV 読み込みができる。
- 日本株、指数、為替で価格表示と数量表示が破綻しない。
- 日足 / 週足 / 月足の切り替えで日付が大きくズレない。
- 売買練習で注文、約定、返済、建玉、勝敗が動く。
- 売買ログ削除時に建玉が破綻しない。
- ペイント練習でスクショ、描画、テキスト、PNG 保存ができる。
- 本数計測で始点・終点・本数表示ができる。
- PC、iPad 横画面、スマホ横画面で致命的に崩れない。
- 免責事項をどこかで明示する。

## 公開時の注意

このツールは投資助言ではない。

必ず以下を明示する。

- 売買判断の練習用ツールである。
- 実際の投資判断は利用者自身の責任。
- 損益計算は簡易計算。
- 手数料、税金、スプレッド、証拠金などを完全には反映していない。
- CSV データの正確性、完全性、継続取得可能性は保証しない。
- yfinance / Yahoo Finance / 各データ提供元の利用条件に従う必要がある。

## データ取得ツールとの関係

Web アプリ側は CSV を読み込む。

データ取得は別ツールで行う方針。

理由:

- ブラウザだけで yfinance を直接使うのは難しい。
- CORS、実行環境、利用規約、安定性の問題がある。
- Windows 向けデータ取得ツールとして切り出した方が扱いやすい。
- Web アプリ側は、市場データを配布するのではなく、ユーザーが用意した CSV を読み込む形にする方が安全。

## 今後の大きな課題

### App.tsx の分割

現状 `App.tsx` は約8600行・約300KBまで大きくなっている。

共通型、既定銘柄定義、CSVパース処理はすでに以下へ分割済み。

- `src/types.ts`
- `src/data/defaultSymbols.ts`
- `src/utils/csv.ts`

ただし、まだ `App.tsx` 内には以下が多く残っている。

- storage key定数。
- localStorage / IndexedDB の保存処理。
- チャート設定の正規化・保存処理。
- 売買練習データの正規化・保存処理。
- ユーザーCSV銘柄の保存処理。
- 日付処理。
- 表示形式・CSV出力処理。
- 足種集計、移動平均線、表示範囲処理。
- ペイント練習処理。
- 売買練習処理。
- UI本体。

ファイル分割は必要だが、UIコンポーネントまで一気に分ける大規模リファクタは避ける。

#### 推奨する分割順

1. `src/constants/storageKeys.ts`
   - `TRADING_BOOKS_STORAGE_KEY`
   - `CHART_SETTINGS_STORAGE_KEY`
   - `CHART_VIEW_STATE_STORAGE_KEY`
   - `SOUND_ENABLED_STORAGE_KEY`
   - `PAINT_MARKS_STORAGE_KEY`
   - `PAINT_CUSTOM_COLORS_STORAGE_KEY`
   - `PAINT_TOOL_COLORS_STORAGE_KEY`
   - `PAINT_TEXT_SETTINGS_STORAGE_KEY`
   - `PAINT_PRACTICE_DB_NAME`
   - `PAINT_PRACTICE_STORE_NAME`
   - `USER_SYMBOLS_STORAGE_KEY`
   - `USER_SYMBOLS_DB_NAME`
   - `USER_SYMBOLS_STORE_NAME`

2. `src/utils/date.ts`
   - `toLocalDate`
   - `formatDate`
   - `formatDateWithWeekday`
   - `chartTimeToDateText`
   - `getCalendarCells`
   - `shiftCalendarMonth`

3. `src/utils/format.ts`
   - `formatCurrencyAmount`
   - `formatQuantity`
   - `formatPrice`
   - `escapeCsvValue`
   - `downloadTextFile`

4. `src/utils/timeframe.ts`
   - `calculateMA`
   - `getWeekEndKey`
   - `getMonthEndKey`
   - `aggregateCandles`
   - `findEndIndexByAnchor`
   - `findDailyDateOnOrBefore`

5. `src/utils/storage/chartSettingsStorage.ts`
   - チャート設定の正規化。
   - `loadChartSettingsFromStorage`
   - `saveChartSettingsToStorage`
   - `loadChartViewStateFromStorage`
   - `saveChartViewStateToStorage`

6. `src/utils/storage/tradingBookStorage.ts`
   - 売買ログ、建玉、未約定注文の正規化。
   - `loadTradingBooksFromStorage`
   - `saveTradingBooksToStorage`

7. `src/utils/storage/userSymbolsStorage.ts`
   - `openUserSymbolsDatabase`
   - `saveUserCsvToDatabase`
   - `loadUserCsvTextFromDatabase`
   - `deleteUserCsvFromDatabase`
   - `loadSavedCsvSymbolsFromStorage`
   - `saveSavedCsvSymbolsToStorage`

8. `src/utils/storage/paintPracticeStorage.ts`
   - ペイント練習のIndexedDB保存。
   - `openPaintPracticeDatabase`
   - `savePaintPracticeToDatabase`
   - `loadPaintPracticesFromDatabase`
   - `deletePaintPracticeFromDatabase`
   - チャートメモ保存処理。

#### 後回しにする分割

以下はpropsが増えやすく差分が大きくなるため、今は後回しにする。

- `TradePanel.tsx`
- `PaintPanel.tsx`
- `SettingsDialog.tsx`
- `ChartArea.tsx`
- App全体の大規模リファクタ

#### Codex推論モデルの使い分け

- 分割計画だけ作る: `非常に高い`
- storage / timeframe / trade など壊れやすい処理の分離: `高`
- 型・定数・文言・CSSなどの小さい分離: `中`

最初は、`非常に高い` で実装せずに分割計画だけ作らせる。
その後、`中〜高` で1ステップずつ実装する。

#### 作業ルール

- 分割前に必ず `npm run build` / `npm run lint` を通す。
- 作業前に必ずcommitする。
- 1回のCodex依頼では1ファイルまたは1種類の処理だけを移す。
- UI変更・新機能追加・リファクタを混ぜない。
- build / lint が通ったらすぐcommitする。
- 差分が大きくなりそうなら、Codexに実装前に止めて報告させる。

### ユーザー CSV 読み込み

段階的に実装する。

#### ステップ1: 一時読み込み

実装済み。

- ファイル選択。
- `Date,Open,High,Low,Close` を検証。
- `Volume` は任意。
- 読み込めたら一時銘柄としてチャート表示。
- リロードしたら消えてもよい。

現在は、ツールバーの `CSV読込` / `Import CSV` からファイルを選び、ファイル名から仮のコード・表示名を作る。

通貨、1玉あたり数量、倍率などは仮設定で読み込むため、次のステップで編集できるようにする。

#### ステップ2: 銘柄情報設定

実装済み。

- 銘柄名。
- コード。
- 市場 / 種別。
- 通貨。
- 1玉あたり数量。
- `multiplier`。
- 表示名。

現在は、一時銘柄設定ダイアログでコード、銘柄名、通貨、単位、1玉あたり数量、倍率、価格小数桁を編集できる。

設定は一時読み込み中のみ有効で、永続保存は次のステップに回す。

#### ステップ3: 保存・管理

- CSV データ本体は IndexedDB に保存。実装済み。
- 銘柄メタ情報は localStorage に保存。実装済み。
- 銘柄一覧から選択。実装済み。
- 名前変更。実装済み。
- 削除。実装済み。
- インポートし直し。実装済み。

現在は、一時CSV銘柄の設定画面から「銘柄一覧に保存」できる。
保存した銘柄はリロード後も銘柄選択プルダウンに残り、選択すると IndexedDB に保存した CSV データからチャートを再表示する。
保存済み銘柄を選択中は歯車ボタンから設定を再編集でき、CSV差し替えと削除もできる。
設定ダイアログの「銘柄管理」タブから、保存済み銘柄を一覧で編集・CSV差し替え・削除できる。
同じコードの保存済み銘柄がある状態で一時CSV銘柄を保存する場合は警告し、既存銘柄への上書き、別銘柄として保存、キャンセルを選べる。

## 公式サイト・URL構成

サービス名は `チャートプレイバック / Chart Playback` で進める。Webアプリ名も公式サイト名も `チャートプレイバック` に統一する。

現在の `https://web-chart.stock-practice.workers.dev/` は仮公開URLとして扱う。正式公開前にURLを整理するため、今後変更になってよい。

最終的なURL構成の第一候補:

```text
公式サイト: https://chart-playback.com/
Webアプリ: https://app.chart-playback.com/
```

ローカル作業フォルダの想定:

```text
D:\workspace\web_chart
→ Webアプリ本体。現在のアプリ開発を継続する。

D:\workspace\chart_playback_site
→ 公式サイト。トップページ、使い方、CSVガイド、料金、免責事項、ツール配布ページなどを作る。
```

最初は公式サイトからWebアプリへリンクする形でよい。Webアプリ本体を公式サイト側へコピーしない。

公開基盤は、レンタルサーバーではなく、Cloudflare Pages / Workers と独自ドメインで進める。必要なのは主に独自ドメインであり、一般的なレンタルサーバーやVPSは当面不要。

Google Analytics を導入する場合は、公式サイトとWebアプリを同じ GA4 プロパティで計測する。`chart-playback.com` と `app.chart-playback.com` のように同じ独自ドメイン配下にしておくと、正式公開後の計測・ブランド整理・ログイン導線が分かりやすい。

## 公式サイトの想定ページ

β公開前に最低限用意したいページ:

- トップページ。
- 使い方。
- CSV読み込みガイド。
- 料金・プラン予定。
- ダミーデータ / サンプル銘柄の説明。
- データ取得ツールの説明・ダウンロードページ。
- 免責事項。
- プライバシーポリシー。
- 利用規約。
- 問い合わせ。

URL例:

```text
/
/app
/how-to-use
/csv-guide
/demo-data
/pricing
/download
/download/windows
/release-notes
/disclaimer
/privacy
/terms
/contact
```

`/app` はWebアプリ本体を埋め込むのではなく、当面は `https://app.chart-playback.com/` へ案内するページまたはボタンでよい。

## プロモーションビデオ方針

プロモーションビデオは、公式サイトのトップページ最小版を作った直後に作る。
ログイン実装、Pro機能、クラウド保存より前に進めてよい。

最初に作る動画は30〜60秒の紹介動画にする。
内容は以下を中心にする。

- 過去チャートを1本ずつ進める。
- 売買練習をする。
- 建玉、損益、勝敗を見る。
- チャートメモを残す。
- ペイントで振り返る。
- CSV読み込み・銘柄管理ができることを短く見せる。

動画内では、投資助言に見える表現を避ける。

避ける表現:

- 勝てる。
- 儲かる。
- 買い時が分かる。
- 必勝。

使う表現:

- 売買判断の練習。
- チャート読解の練習。
- 過去チャートで振り返る。
- 投資助言ではありません。


## ゲスト向けサンプルデータ

ゲストは自分のCSV銘柄追加をできない方向で検討する。その代わり、サンプル銘柄で主要機能を体験できるようにする。

サンプルデータは、実在企業名・実在ティッカー・実在株価を避け、完全な架空データにする。

最初から20銘柄は不要。β版では 5〜8銘柄程度でよい。

候補:

```text
DEMO-AUTO   架空自動車: 上昇トレンド
DEMO-TECH   架空テック: 急騰・急落あり
DEMO-FOOD   架空食品: 安定した値動き
DEMO-BANK   架空金融: レンジ相場
DEMO-BIO    架空バイオ: 値動き激しめ
DEMO-FX     架空ドル円風: 小数価格・為替風
```

画面やサイトには、以下の趣旨を明示する。

```text
サンプル銘柄はすべて架空データです。
実在の企業・銘柄・指数・為替レートとは関係ありません。
投資判断には使用できません。
```

`USD/JPY` 風のサンプルを置く場合も、表示名は `架空ドル円サンプル` や `USD/JPY風サンプル（架空データ）` のようにし、実際の為替レートではないことを明記する。

## 会員プラン別の想定

将来的に公開範囲を広げる場合、CSV銘柄追加・銘柄管理・データ取得ツール配布は会員プランで制限する想定。

### ゲスト

- 公式サイト閲覧。
- Webアプリのサンプル銘柄利用。
- 売買練習、ペイント、本数計測など主要機能の体験。
- CSV銘柄追加は不可。
- 保存済み銘柄追加は不可。
- データ取得ツールのダウンロードは不可。

### 無料会員

- CSV銘柄追加。
- 銘柄管理。
- ブラウザ内保存。
- 保存銘柄数は10件までにする。
- Windows向けデータ取得ツールのダウンロード。
- お知らせ・更新情報の受け取り候補。

クラウド保存は無料会員の必須機能にしない。無料会員の主なメリットは、自分のCSV銘柄を追加できること、データ取得ツールを使えることに置く。

### Pro / 有料会員

- クラウド保存。
- 別端末同期。
- 保存銘柄数の拡張または無制限。
- 真剣練習モード。
- 練習結果サマリー。
- 練習履歴保存。
- 高度な銘柄管理。

有料会員向け候補:

- 保存済み銘柄の並べ替え。
- 一括削除。
- 非表示。
- 保存済み銘柄一覧の検索。
- より丁寧な削除確認や管理機能。

## 共通アカウント・ログイン方針

銘柄ダウンロードツールを無料会員向けに配布するため、公式サイト側にもログイン機能が必要。

ただし、公式サイト用アカウントとWebアプリ用アカウントを別々に作らない。`Chart Playback 共通アカウント` として、公式サイト・Webアプリ・データ取得ツール配布で同じ認証基盤を使う。

想定構成:

```text
chart-playback.com
→ 公式サイト、会員登録、ログイン、ツール配布、使い方、料金、規約。

app.chart-playback.com
→ Webアプリ、ログイン状態確認、CSV追加、銘柄管理、売買練習。

共通認証
→ Supabase Auth など。
```

ログイン入口は公式サイトにもWebアプリにも置く。実体は同じ認証基盤にする。

最初はクラウド保存まで実装しなくてよい。まずは、ログイン状態とプラン判定だけで以下を制御する。

- ゲストか無料会員か。
- CSV追加を許可するか。
- データ取得ツールをダウンロードできるか。
- 将来Pro機能を表示・制限できるか。

ユーザープロフィールで持つ候補:

```text
user_profiles
- user_id
- email
- plan: free / pro
- created_at
- terms_accepted_at
- privacy_accepted_at
- marketing_opt_in
```

## データ取得ツール配布

Windows向けデータ取得ツールは、無料会員向けに配布する方針。

公式サイト側に以下のページを用意する。

```text
/download
→ データ取得ツールの説明。

/download/windows
→ Windows版ダウンロード。

/download/release-notes
→ 更新履歴。
```

未ログインのユーザーには、以下のような案内を表示する。

```text
データ取得ツールは無料会員向けです。
無料登録するとダウンロードできます。
```

最初は、ログイン後だけダウンロードリンクを表示する簡易制限でよい。将来的には、ログイン確認後に期限付きURLを発行する、ダウンロード履歴を記録する、配布ファイルの署名やバージョン管理を整える。

### スマホ最適化

現在は横画面前提で最低限対応。

Web サイトではネイティブアプリのような完全な画面回転強制は難しいため、縦画面では横画面案内を出す方針が現実的。

## Git運用

作業をやり直すコストを避けるため、以下のタイミングでこまめにコミットする。

- build / lint が通った時。
- 1つの機能が想定通り動いた時。
- Codex の使用量が増えてきた時。
- 今日はここまで、と思った時。

基本コマンド:

```powershell
git status
git diff --stat
git add src/App.tsx src/index.css docs/todo.md docs/spec.md docs/release-plan.md
git commit -m "Update project docs and CSV management plan"
git push
```

docs だけコミットする場合:

```powershell
git add docs/todo.md docs/spec.md docs/release-plan.md
git commit -m "Update project docs"
git push
```
