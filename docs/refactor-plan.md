# App.tsx 分割計画

最終更新: 2026-07-02

## 目的

`src/App.tsx` が肥大化しており、今後の機能追加や会員制対応を進める前に、段階的にファイル分割する。

目的は以下。

- `App.tsx` の見通しを良くする
- Codexでの作業差分を小さくする
- 不具合発生時に原因を追いやすくする
- 今後の無料会員・Pro会員・公式サイト連携に備える
- UIコンポーネント分割の前に、定数・型・ユーティリティ・保存処理を整理する

## 基本方針

ファイル分割は、1回の作業で1テーマだけ行う。

やってよいこと:

- 定数の移動
- 型定義の移動
- 純粋関数の移動
- localStorage / IndexedDB まわりの保存処理の分離
- import / export の整理
- lint / build が通る範囲の小さな修正

やってはいけないこと:

- UI変更
- CSS変更
- 新機能追加
- 売買ロジックの仕様変更
- CSV保存仕様の変更
- 保存キー文字列の変更
- App.tsx全体の大規模書き換え
- TradePanel / PaintPanel / SettingsDialog などの大きなUI分割を先に行うこと

## Codex推論モデルの使い分け

### 非常に高い

使う場面:

- App.tsx 全体の分割計画を立てる
- 依存関係を調査する
- 複数機能にまたがる不具合の原因を調査する

原則として、非常に高いモデルでは「編集禁止・計画だけ」にする。

### 高

使う場面:

- 保存処理の分離
- 売買ロジック関連の分離
- 足種変換関連の分離
- IndexedDB関連の分離
- 複数ファイルにまたがるが、範囲を明確に限定した作業

### 中

使う場面:

- docs更新
- 定数だけの分離
- 型だけの移動
- 日付・フォーマットなど比較的安全なユーティリティ分離
- 文言修正
- 小さいUI修正

## 作業前の共通手順

各分割作業の前に、必ず以下を確認する。

```powershell
cd D:\workspace\web_chart

git status
npm.cmd run lint
npm.cmd run build
```

作業ツリーが clean で、lint / build が通る状態から始める。

必要に応じて作業ブランチを作る。

```powershell
git switch -c refactor-app-split-plan
```

既にブランチがある場合:

```powershell
git switch refactor-app-split-plan
```

## 作業後の共通手順

Codex作業後は、必ず以下を確認する。

```powershell
npm.cmd run lint
npm.cmd run build
git status
git diff
```

確認すること:

- 想定外のファイルが変更されていないか
- UIやCSSが変更されていないか
- 保存キー文字列が変わっていないか
- import / export のみの必要最小限の変更か
- lint / build が通っているか

問題なければ commit する。

```powershell
git add .
git commit -m "<作業内容>"
git push
```

## 分割の推奨順

### D-1-1 storageKeys.ts の作成

最初に行う作業。

作成するファイル:

```text
src/constants/storageKeys.ts
```

移す対象:

```ts
TRADING_BOOKS_STORAGE_KEY
CHART_SETTINGS_STORAGE_KEY
CHART_VIEW_STATE_STORAGE_KEY
SOUND_ENABLED_STORAGE_KEY
PAINT_MARKS_STORAGE_KEY
PAINT_CUSTOM_COLORS_STORAGE_KEY
PAINT_TOOL_COLORS_STORAGE_KEY
PAINT_TEXT_SETTINGS_STORAGE_KEY
PAINT_PRACTICE_DB_NAME
PAINT_PRACTICE_STORE_NAME
USER_SYMBOLS_STORAGE_KEY
USER_SYMBOLS_DB_NAME
USER_SYMBOLS_STORE_NAME
```

注意点:

- 保存キーの文字列は絶対に変更しない
- DB名とSTORE名はセットで移す
- App.tsxからimportして使う
- 他の関数・型・UIは移動しない

Codex推論モデル:

```text
中 または 高
```

commit例:

```powershell
git commit -m "Extract storage key constants"
```

### D-1-2 types.ts の拡張

既存の `src/types.ts` に、App.tsx内に残っている型を段階的に移す。

最初に移す候補:

```ts
Timeframe
OrderAction
PositionSide
PositionLot
PendingOrder
TradeLog
TradingBook
ChartViewState
TemporaryCsvSymbol
SavedCsvSymbol
TemporaryCsvSymbolForm
```

注意点:

- ペイント系の型は後回しでよい
- UI状態に強く結びつく型は無理に移さない
- まずは保存処理・ユーティリティで使う型を優先する

Codex推論モデル:

```text
中
```

commit例:

```powershell
git commit -m "Move shared app types"
```

### D-1-3 date.ts の作成

作成するファイル:

```text
src/utils/date.ts
```

移す対象:

```ts
weekdays
toLocalDate
formatDate
formatDateWithWeekday
chartTimeToDateText
getCalendarCells
shiftCalendarMonth
```

注意点:

- `chartTimeToDateText` は `lightweight-charts` の `Time` 型を使う
- 日付表示の挙動を変えない
- カレンダー表示の仕様を変えない

Codex推論モデル:

```text
中
```

commit例:

```powershell
git commit -m "Extract date utilities"
```

### D-1-4 format.ts の作成

作成するファイル:

```text
src/utils/format.ts
```

移す対象:

```ts
formatCurrencyAmount
formatQuantity
formatPrice
escapeCsvValue
downloadTextFile
getMinMove
```

注意点:

- 売買ログCSV出力に影響するため、CSV出力は動作確認する
- 通貨表示、数量表示、価格表示の見た目を変えない

Codex推論モデル:

```text
中
```

commit例:

```powershell
git commit -m "Extract formatting utilities"
```

### D-1-5 symbols.ts の作成

作成するファイル:

```text
src/utils/symbols.ts
```

移す対象:

```ts
getStockInfoFromPath
createTemporaryCsvPath
createSavedCsvPath
isTemporaryCsvPath
isUserCsvPath
getPriceDecimalsFromCandles
createTemporaryCsvSymbolForm
normalizeTemporaryCsvSymbolForm
normalizeSavedCsvSymbol
candlesToCsvText
```

注意点:

- CSV一時読み込み・保存済み銘柄管理に影響する
- `TemporaryCsvSymbol` / `SavedCsvSymbol` などの型移動と順番を合わせる
- 保存済み銘柄のpath形式を変えない
- `temp-csv:` / `user-csv:` の接頭辞は変更しない

Codex推論モデル:

```text
中 または 高
```

commit例:

```powershell
git commit -m "Extract symbol utilities"
```

### D-1-6 timeframe.ts の作成

作成するファイル:

```text
src/utils/timeframe.ts
```

移す対象:

```ts
calculateMA
getWeekEndKey
getMonthEndKey
aggregateCandles
calculateAutoDisplayBars
findEndIndexByAnchor
findDailyDateOnOrBefore
pickInitialAnchorDate
getChartViewStateKey
```

注意点:

- 日足 / 週足 / 月足の表示に直結する
- 上位足で未来の未完成足を表示しない仕様を壊さない
- 日足へ戻したときの日付ズレ修正を壊さない
- 表示本数・初期表示位置の挙動を変えない

Codex推論モデル:

```text
高
```

commit例:

```powershell
git commit -m "Extract timeframe utilities"
```

## 保存処理の分割

### D-2-1 tradingBookStorage.ts の作成

作成するファイル:

```text
src/utils/storage/tradingBookStorage.ts
```

移す対象:

```ts
createEmptyTradingBook
isValidOrderAction
isValidPositionSide
normalizePositionLot
normalizePendingOrder
normalizeTradeLog
normalizeTradingBook
loadTradingBooksFromStorage
saveTradingBooksToStorage
```

注意点:

- 売買練習データの保存・復元に影響する
- `TradingBook` / `TradeLog` / `PositionLot` などの型移動後に行う
- 既存の売買ログを壊さない
- 旧形式の `pendingOrder` から `pendingOrders` へ復元する処理を維持する

Codex推論モデル:

```text
高
```

commit例:

```powershell
git commit -m "Extract trading book storage"
```

### D-2-2 chartSettingsStorage.ts の作成

作成するファイル:

```text
src/utils/storage/chartSettingsStorage.ts
```

移す対象:

```ts
normalizeLanguage
clampNumber
normalizeMaDisplaySetting
normalizeChartAppearanceDraft
normalizeTradingSettingsDraft
normalizeViewSettingsDraft
loadChartSettingsFromStorage
saveChartSettingsToStorage
loadChartViewStateFromStorage
saveChartViewStateToStorage
```

注意点:

- 移動平均線設定、チャート外観、売買設定、表示本数設定に影響する
- `clampNumber` は他のutilsからも使う可能性があるため、必要なら別ファイル化を検討する
- 既存localStorageの読み込み互換性を壊さない

Codex推論モデル:

```text
高
```

commit例:

```powershell
git commit -m "Extract chart settings storage"
```

### D-2-3 userSymbolsStorage.ts の作成

作成するファイル:

```text
src/utils/storage/userSymbolsStorage.ts
```

移す対象:

```ts
openUserSymbolsDatabase
saveUserCsvToDatabase
loadUserCsvTextFromDatabase
deleteUserCsvFromDatabase
loadSavedCsvSymbolsFromStorage
saveSavedCsvSymbolsToStorage
```

注意点:

- CSV銘柄保存・CSV差し替え・保存済み銘柄削除に影響する
- IndexedDBのDB名・store名を変えない
- localStorageの保存済み銘柄メタ情報を壊さない
- 無料会員10銘柄制限を将来入れやすい形にするが、この作業では制限実装はしない

Codex推論モデル:

```text
高
```

commit例:

```powershell
git commit -m "Extract user symbols storage"
```

### D-2-4 paintPracticeStorage.ts の作成

作成するファイル:

```text
src/utils/storage/paintPracticeStorage.ts
```

移す対象:

```ts
openPaintPracticeDatabase
savePaintPracticeToDatabase
loadPaintPracticesFromDatabase
deletePaintPracticeFromDatabase
normalizePaintMark
loadPaintMarksFromStorage
savePaintMarksToStorage
```

注意点:

- ペイント練習保存、チャートメモ保存に影響する
- IndexedDBのDB名・store名を変えない
- チャートメモの既存データを壊さない
- ペイント練習の保存済み画像・描画オブジェクトを壊さない

Codex推論モデル:

```text
高
```

commit例:

```powershell
git commit -m "Extract paint practice storage"
```

## ペイント系ユーティリティの分割

保存処理の後に検討する。

候補ファイル:

```text
src/utils/paint.ts
```

移す候補:

```ts
getPaintTextFontSize
getPaintTextFontFamily
drawPaintObject
isPointNearPaintObject
getPaintMarkDisplayText
loadPaintCustomColors
loadPaintToolColors
loadPaintTextSettings
```

注意点:

- Canvas描画に影響する
- テキスト描画、ドラッグ、消しゴム、色設定に影響する
- 先にペイント系の型を `types.ts` に移す必要がある

Codex推論モデル:

```text
高
```

## チャート外観系ユーティリティの分割

候補ファイル:

```text
src/utils/chartTheme.ts
```

移す候補:

```ts
isLightChartTheme
getChartBackgroundColor
getChartTextColor
getChartBorderColor
getGridLineColor
getAppBackgroundColor
getAppThemeStyle
hexToRgba
toLineWidth
toLineStyle
getLineStyleDashArray
```

注意点:

- チャート外観、テーマ、移動平均線の表示に影響する
- lightweight-charts の `LineStyle` を使うためimportに注意する
- CSS変数の値を変えない

Codex推論モデル:

```text
中 または 高
```

## まだ後回しにするもの

以下は、定数・型・ユーティリティ・保存処理の分離がある程度終わってから行う。

```text
TradePanel.tsx
PaintPanel.tsx
SettingsDialog.tsx
ChartArea.tsx
SymbolManager.tsx
Toolbar.tsx
```

理由:

- propsが大量になりやすい
- 差分が大きくなりやすい
- UIと状態管理が強く結びついている
- Codexの作業範囲が広がりやすい
- 不具合が出たときに原因を追いにくい

## D-1-1 Codex依頼文

最初の実装作業では、以下をCodexに貼る。

```text
今回の作業は、App.tsx から storage key と DB名・store名の定数だけを分離することです。

作成するファイル：
- src/constants/storageKeys.ts

移すもの：
- TRADING_BOOKS_STORAGE_KEY
- CHART_SETTINGS_STORAGE_KEY
- CHART_VIEW_STATE_STORAGE_KEY
- SOUND_ENABLED_STORAGE_KEY
- PAINT_MARKS_STORAGE_KEY
- PAINT_CUSTOM_COLORS_STORAGE_KEY
- PAINT_TOOL_COLORS_STORAGE_KEY
- PAINT_TEXT_SETTINGS_STORAGE_KEY
- PAINT_PRACTICE_DB_NAME
- PAINT_PRACTICE_STORE_NAME
- USER_SYMBOLS_STORAGE_KEY
- USER_SYMBOLS_DB_NAME
- USER_SYMBOLS_STORE_NAME

条件：
- UI変更はしない
- 新機能追加はしない
- ロジック変更はしない
- 保存キーの文字列は絶対に変更しない
- 既存機能の挙動を変えない
- App.tsx から import して使う形にする
- ほかの関数、型、UIコンポーネントは今回は移動しない
- npm.cmd run lint と npm.cmd run build が通ることを確認する
- lint/build が通ったらそこで作業を止める
```

## リリース計画との関係

この分割作業は、次の機能追加の前準備とする。

今後予定している主な作業:

- ゲスト用架空サンプル銘柄の整備
- 無料会員はCSV保存銘柄10件まで
- Webアプリ名・公式サイト名は「チャートプレイバック」に統一
- 公式サイト `chart-playback.com`
- Webアプリ `app.chart-playback.com`
- データ取得ツールの無料会員向け配布
- Pro機能としてクラウド保存、真剣練習、練習結果サマリーを実装

App.tsxが巨大なまま会員制やPro機能を追加すると、作業差分が大きくなりやすいため、先に段階的な分割を進める。

## 完了判定

この計画の初期段階は、以下まで進めば一区切りとする。

```text
D-1-1 storageKeys.ts
D-1-2 types.ts 拡張
D-1-3 date.ts
D-1-4 format.ts
D-1-5 symbols.ts
D-1-6 timeframe.ts
```

ここまで終わると、App.tsxから比較的安全なロジックが外に出る。

次の段階で、storage系の分割に進む。

```text
D-2-1 tradingBookStorage.ts
D-2-2 chartSettingsStorage.ts
D-2-3 userSymbolsStorage.ts
D-2-4 paintPracticeStorage.ts
```

その後、必要に応じてUIコンポーネント分割を検討する。
