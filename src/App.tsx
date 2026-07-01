import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Papa from "papaparse";
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { DATA_FILES, getInstrumentDefinition } from "./dataFiles";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const BAR_SPACING = 8;
const MIN_AUTO_DISPLAY_BARS = 30;
const MAX_AUTO_DISPLAY_BARS = 320;
const WHEEL_NAVIGATION_THRESHOLD = 40;
const TRADING_BOOKS_STORAGE_KEY = "stock-practice-trading-books-v1";
const CHART_SETTINGS_STORAGE_KEY = "stock-practice-chart-settings-v1";
const CHART_VIEW_STATE_STORAGE_KEY = "stock-practice-chart-view-state-v1";
const SOUND_ENABLED_STORAGE_KEY = "stock-practice-sound-enabled-v1";
const PAINT_MARKS_STORAGE_KEY = "stock-practice-paint-marks-v1";
const PAINT_CUSTOM_COLORS_STORAGE_KEY = "stock-practice-paint-custom-colors-v1";
const PAINT_TOOL_COLORS_STORAGE_KEY = "stock-practice-paint-tool-colors-v1";
const PAINT_PRACTICE_DB_NAME = "stock-practice-paint-db";
const PAINT_PRACTICE_STORE_NAME = "paint-practices";
const DEFAULT_TRADE_DRAW_RATE_THRESHOLD = 0.005;


type Timeframe = "daily" | "weekly" | "monthly";
type VisibleLogicalRange = { from: number; to: number };
type DisplayBarsOption = "auto" | "remember" | "50" | "75" | "100" | "150" | "200";
type DisplayBarsMode = "auto" | "remember" | "fixed";
type InitialPositionMode = "latest" | "offset" | "remember" | "earliest";
type SettingsTab = "ma" | "appearance" | "trading" | "view";
type TradeOutcome = "win" | "loss" | "draw";
type ExecutionTiming = "next-open" | "same-close";
type AppLanguage = "ja" | "en";
type ChartTheme = "dark" | "dark-blue" | "black" | "light" | "light-gray" | "ivory";
type SettingSize = "small" | "medium" | "large";
type MaLineStyleOption =
  | "solid"
  | "dotted"
  | "dashed"
  | "large-dashed"
  | "sparse-dotted";
type PaintMarkType = "up" | "down" | "memo";
type PaintPracticeTool =
  | "line"
  | "curve"
  | "freehand"
  | "arrow"
  | "ellipse"
  | "rectangle"
  | "text"
  | "eraser";
type PaintToolColorMap = Partial<Record<PaintPracticeTool, string>>;

type PaintPoint = {
  x: number;
  y: number;
};

type PaintDrawingObject = {
  id: string;
  type: Exclude<PaintPracticeTool, "eraser">;
  color: string;
  width: number;
  points: PaintPoint[];
  text?: string;
};

type PaintTextEditor = {
  point: PaintPoint;
  left: number;
  top: number;
  value: string;
};

type SavedPaintPractice = {
  id: string;
  stockPath: string;
  stockCode: string;
  stockName: string;
  targetDate: string;
  createdAt: string;
  backgroundDataUrl: string;
  objects: PaintDrawingObject[];
  note: string;
};

type PaintMark = {
  id: string;
  date: string;
  type: PaintMarkType;
  text: string;
  createdAt: string;
};


type MaDisplaySetting = {
  id: string;
  label: string;
  enabled: boolean;
  period: number;
  color: string;
  width: number;
  style: MaLineStyleOption;
  opacity: number;
};

type ChartAppearanceDraft = {
  theme: ChartTheme;
  gridVisible: boolean;
  gridDensity: SettingSize;
  bullishColor: string;
  bearishColor: string;
};
type TradingSettingsDraft = {
  executionTiming: ExecutionTiming;
  drawRateThreshold: number;
};
type ViewSettingsDraft = {
  displayBarsMode: DisplayBarsMode;
  fixedDisplayBars: number;
  initialPositionMode: InitialPositionMode;
  initialPositionOffsetBars: number;
};
type ChartViewState = {
  displayBarsByKey: Record<string, number>;
  anchorDateByKey: Record<string, string>;
};
type OrderAction = "add-short" | "close-short" | "add-long" | "close-long";
type PositionSide = "short" | "long";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type CsvCandleRow = {
  Date?: string;
  Open?: string | number;
  High?: string | number;
  Low?: string | number;
  Close?: string | number;
};

type DisplayCandle = Candle & {
  sourceStartTime: string;
  sourceEndTime: string;
};

type MaPoint = {
  time: string;
  value: number;
};

type PositionLot = {
  id: string;
  side: PositionSide;
  entryDate: string;
  entryPrice: number;
  sharesPerLot: number;
};

type PendingOrder = {
  id: string;
  action: OrderAction;
  lots: number;
  shares: number;
  sharesPerLot: number;
  orderedDate: string;
  executeDate: string;
  executionTiming: ExecutionTiming;
};

type TradeLog = {
  id: string;
  action: OrderAction;
  lots: number;
  shares: number;
  orderedDate: string;
  executionDate: string;
  executionPrice: number;
  realizedProfit: number | null;
  positionIds?: string[];
  closesPositionIds?: string[];
  closedPositions?: PositionLot[];
};

type TradingBook = {
  shortPositions: PositionLot[];
  longPositions: PositionLot[];
  pendingOrder: PendingOrder | null;
  pendingOrders: PendingOrder[];
  logs: TradeLog[];
};

function createEmptyTradingBook(): TradingBook {
  return {
    shortPositions: [],
    longPositions: [],
    pendingOrder: null,
    pendingOrders: [],
    logs: [],
  };
}

function isValidOrderAction(value: unknown): value is OrderAction {
  return (
    value === "add-short" ||
    value === "close-short" ||
    value === "add-long" ||
    value === "close-long"
  );
}

function isValidPositionSide(value: unknown): value is PositionSide {
  return value === "short" || value === "long";
}

function normalizePositionLot(value: unknown): PositionLot | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<PositionLot>;
  if (
    typeof item.id !== "string" ||
    !isValidPositionSide(item.side) ||
    typeof item.entryDate !== "string" ||
    typeof item.entryPrice !== "number" ||
    typeof item.sharesPerLot !== "number"
  ) {
    return null;
  }

  return {
    id: item.id,
    side: item.side,
    entryDate: item.entryDate,
    entryPrice: item.entryPrice,
    sharesPerLot: item.sharesPerLot,
  };
}

function normalizePendingOrder(value: unknown): PendingOrder | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<PendingOrder>;
  if (
    typeof item.id !== "string" ||
    !isValidOrderAction(item.action) ||
    typeof item.lots !== "number" ||
    typeof item.shares !== "number" ||
    typeof item.sharesPerLot !== "number" ||
    typeof item.orderedDate !== "string" ||
    typeof item.executeDate !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    action: item.action,
    lots: item.lots,
    shares: item.shares,
    sharesPerLot: item.sharesPerLot,
    orderedDate: item.orderedDate,
    executeDate: item.executeDate,
    executionTiming:
      item.executionTiming === "same-close" ? "same-close" : "next-open",
  };
}

function normalizeTradeLog(value: unknown): TradeLog | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<TradeLog>;
  if (
    typeof item.id !== "string" ||
    !isValidOrderAction(item.action) ||
    typeof item.lots !== "number" ||
    typeof item.shares !== "number" ||
    typeof item.orderedDate !== "string" ||
    typeof item.executionDate !== "string" ||
    typeof item.executionPrice !== "number" ||
    !(typeof item.realizedProfit === "number" || item.realizedProfit === null)
  ) {
    return null;
  }

  return {
    id: item.id,
    action: item.action,
    lots: item.lots,
    shares: item.shares,
    orderedDate: item.orderedDate,
    executionDate: item.executionDate,
    executionPrice: item.executionPrice,
    realizedProfit: item.realizedProfit,
    positionIds: Array.isArray(item.positionIds)
      ? item.positionIds.filter((id): id is string => typeof id === "string")
      : undefined,
    closesPositionIds: Array.isArray(item.closesPositionIds)
      ? item.closesPositionIds.filter(
          (id): id is string => typeof id === "string"
        )
      : undefined,
    closedPositions: Array.isArray(item.closedPositions)
      ? item.closedPositions
          .map(normalizePositionLot)
          .filter((position): position is PositionLot => position !== null)
      : undefined,
  };
}

function normalizeTradingBook(value: unknown): TradingBook {
  if (!value || typeof value !== "object") return createEmptyTradingBook();

  const item = value as Partial<TradingBook>;
  const legacyPendingOrder = normalizePendingOrder(item.pendingOrder);
  const pendingOrders = Array.isArray(item.pendingOrders)
    ? item.pendingOrders
        .map(normalizePendingOrder)
        .filter((order): order is PendingOrder => order !== null)
    : legacyPendingOrder
      ? [legacyPendingOrder]
      : [];

  return {
    shortPositions: Array.isArray(item.shortPositions)
      ? item.shortPositions
          .map(normalizePositionLot)
          .filter((lot): lot is PositionLot => lot !== null)
      : [],
    longPositions: Array.isArray(item.longPositions)
      ? item.longPositions
          .map(normalizePositionLot)
          .filter((lot): lot is PositionLot => lot !== null)
      : [],
    pendingOrder: null,
    pendingOrders,
    logs: Array.isArray(item.logs)
      ? item.logs.map(normalizeTradeLog).filter((log): log is TradeLog => log !== null)
      : [],
  };
}

function loadTradingBooksFromStorage(): Record<string, TradingBook> {
  if (typeof window === "undefined") return {};

  try {
    const rawValue = window.localStorage.getItem(TRADING_BOOKS_STORAGE_KEY);
    if (!rawValue) return {};

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!parsedValue || typeof parsedValue !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsedValue as Record<string, unknown>).map(([key, value]) => [
        key,
        normalizeTradingBook(value),
      ])
    );
  } catch (error) {
    console.warn("売買練習データの読み込みに失敗しました", error);
    return {};
  }
}

function saveTradingBooksToStorage(books: Record<string, TradingBook>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      TRADING_BOOKS_STORAGE_KEY,
      JSON.stringify(books)
    );
  } catch (error) {
    console.warn("売買練習データの保存に失敗しました", error);
  }
}

function isValidPaintMarkType(value: unknown): value is PaintMarkType {
  return value === "up" || value === "down" || value === "memo";
}

function normalizePaintMark(value: unknown): PaintMark | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<PaintMark>;
  if (
    typeof item.id !== "string" ||
    typeof item.date !== "string" ||
    !isValidPaintMarkType(item.type) ||
    typeof item.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    date: item.date,
    type: item.type,
    text: typeof item.text === "string" ? item.text : "",
    createdAt: item.createdAt,
  };
}

function loadPaintMarksFromStorage(): Record<string, PaintMark[]> {
  if (typeof window === "undefined") return {};

  try {
    const rawValue = window.localStorage.getItem(PAINT_MARKS_STORAGE_KEY);
    if (!rawValue) return {};

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!parsedValue || typeof parsedValue !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsedValue as Record<string, unknown>).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value
              .map(normalizePaintMark)
              .filter((mark): mark is PaintMark => mark !== null)
          : [],
      ])
    );
  } catch (error) {
    console.warn("チャートメモの読み込みに失敗しました", error);
    return {};
  }
}

function savePaintMarksToStorage(marksByStock: Record<string, PaintMark[]>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      PAINT_MARKS_STORAGE_KEY,
      JSON.stringify(marksByStock)
    );
  } catch (error) {
    console.warn("チャートメモの保存に失敗しました", error);
  }
}


function escapeCsvValue(value: string | number | null) {
  const text = value === null ? "" : String(value);

  if (!/[",\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(fileName: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openPaintPracticeDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PAINT_PRACTICE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PAINT_PRACTICE_STORE_NAME)) {
        database.createObjectStore(PAINT_PRACTICE_STORE_NAME, {
          keyPath: "id",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePaintPracticeToDatabase(item: SavedPaintPractice) {
  const database = await openPaintPracticeDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      PAINT_PRACTICE_STORE_NAME,
      "readwrite"
    );
    transaction.objectStore(PAINT_PRACTICE_STORE_NAME).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function loadPaintPracticesFromDatabase() {
  const database = await openPaintPracticeDatabase();
  const items = await new Promise<SavedPaintPractice[]>((resolve, reject) => {
    const transaction = database.transaction(
      PAINT_PRACTICE_STORE_NAME,
      "readonly"
    );
    const request = transaction
      .objectStore(PAINT_PRACTICE_STORE_NAME)
      .getAll();
    request.onsuccess = () =>
      resolve((request.result as SavedPaintPractice[]).reverse());
    request.onerror = () => reject(request.error);
  });
  database.close();

  return items;
}

async function deletePaintPracticeFromDatabase(id: string) {
  const database = await openPaintPracticeDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      PAINT_PRACTICE_STORE_NAME,
      "readwrite"
    );
    transaction.objectStore(PAINT_PRACTICE_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getPaintTextFontSize(width: number) {
  if (width <= 1) return 28;
  if (width <= 3) return 36;
  if (width <= 6) return 48;
  return 64;
}

function formatCurrencyAmount(value: number, currency: string, showSign = true) {
  const fractionDigits = currency === "JPY" ? 0 : 2;
  const rounded =
    currency === "JPY"
      ? Math.round(value)
      : Math.round(value * 100) / 100;
  const sign = showSign && rounded > 0 ? "+" : "";
  const formatted = rounded.toLocaleString("ja-JP", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const suffix = currency === "JPY" ? "円" : ` ${currency}`;

  return `${sign}${formatted}${suffix}`;
}

function formatQuantity(value: number, unitLabel: string) {
  return `${value.toLocaleString("ja-JP")}${unitLabel}`;
}

type SoundEffect = "success" | "trade" | "error" | "camera";

function loadSoundEnabled() {
  return window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY) !== "false";
}

function playSoundEffect(effect: SoundEffect, enabled: boolean) {
  if (!enabled) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.04, context.currentTime);
  masterGain.connect(context.destination);

  const playTone = (
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 1
  ) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
    gain.gain.setValueAtTime(0, context.currentTime + start);
    gain.gain.linearRampToValueAtTime(volume, context.currentTime + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + start + duration
    );
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(context.currentTime + start);
    oscillator.stop(context.currentTime + start + duration);
  };

  if (effect === "camera") {
    playTone(900, 0, 0.045, "square", 0.7);
    playTone(2400, 0.055, 0.035, "triangle", 0.45);
  } else if (effect === "trade") {
    playTone(660, 0, 0.08, "sine", 0.8);
    playTone(990, 0.08, 0.12, "sine", 0.65);
  } else if (effect === "error") {
    playTone(220, 0, 0.16, "sawtooth", 0.55);
  } else {
    playTone(720, 0, 0.07, "triangle", 0.6);
    playTone(1080, 0.07, 0.09, "triangle", 0.45);
  }

  window.setTimeout(() => void context.close(), 350);
}

function formatPrice(value: number, decimals: number) {
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getMinMove(decimals: number) {
  return decimals <= 0 ? 1 : 1 / 10 ** decimals;
}

function getExecutionPrice(candle: Candle, timing: ExecutionTiming) {
  return timing === "same-close" ? candle.close : candle.open;
}

function getExecutionTimingPriceLabel(timing: ExecutionTiming) {
  return timing === "same-close" ? "終値" : "始値";
}

function drawPaintObject(
  context: CanvasRenderingContext2D,
  object: PaintDrawingObject
) {
  const [start, ...rest] = object.points;
  const end = object.points[object.points.length - 1] ?? start;
  if (!start || !end) return;

  context.save();
  context.strokeStyle = object.color;
  context.fillStyle = object.color;
  context.lineWidth = object.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (object.type === "freehand") {
    context.beginPath();
    context.moveTo(start.x, start.y);
    rest.forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  } else if (object.type === "line") {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  } else if (object.type === "curve") {
    const controlX = (start.x + end.x) / 2;
    const controlY =
      Math.min(start.y, end.y) - Math.max(30, Math.abs(end.x - start.x) * 0.22);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(controlX, controlY, end.x, end.y);
    context.stroke();
  } else if (object.type === "arrow") {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = Math.max(12, object.width * 4);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.lineTo(
      end.x - headLength * Math.cos(angle - Math.PI / 6),
      end.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    context.moveTo(end.x, end.y);
    context.lineTo(
      end.x - headLength * Math.cos(angle + Math.PI / 6),
      end.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    context.stroke();
  } else if (object.type === "rectangle") {
    context.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
  } else if (object.type === "ellipse") {
    context.beginPath();
    context.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      Math.max(1, Math.abs(end.x - start.x) / 2),
      Math.max(1, Math.abs(end.y - start.y) / 2),
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
  } else if (object.type === "text" && object.text) {
    const fontSize = getPaintTextFontSize(object.width);
    context.font = `700 ${fontSize}px "Yu Gothic UI", sans-serif`;
    context.textBaseline = "top";
    const metrics = context.measureText(object.text);
    const paddingX = Math.max(8, fontSize * 0.2);
    const paddingY = Math.max(5, fontSize * 0.12);
    context.fillStyle = "rgba(8, 15, 25, 0.72)";
    context.fillRect(
      start.x - paddingX,
      start.y - paddingY,
      metrics.width + paddingX * 2,
      fontSize + paddingY * 2
    );
    context.fillStyle = object.color;
    context.strokeStyle = "rgba(0, 0, 0, 0.9)";
    context.lineWidth = Math.max(2, fontSize * 0.08);
    context.strokeText(object.text, start.x, start.y);
    context.fillText(object.text, start.x, start.y);
  }

  context.restore();
}

function isPointNearPaintObject(point: PaintPoint, object: PaintDrawingObject) {
  const padding = Math.max(14, object.width * 3);
  const xs = object.points.map((item) => item.x);
  const ys = object.points.map((item) => item.y);
  if (object.type === "text") {
    const fontSize = getPaintTextFontSize(object.width);
    const width = Math.max(60, (object.text?.length ?? 1) * fontSize);
    const height = fontSize * 1.25;
    return (
      point.x >= xs[0] - padding &&
      point.x <= xs[0] + width + padding &&
      point.y >= ys[0] - padding &&
      point.y <= ys[0] + height + padding
    );
  }

  return (
    point.x >= Math.min(...xs) - padding &&
    point.x <= Math.max(...xs) + padding &&
    point.y >= Math.min(...ys) - padding &&
    point.y <= Math.max(...ys) + padding
  );
}

const DEFAULT_MA_DISPLAY_SETTINGS: MaDisplaySetting[] = [
  { id: "ma-5", label: "5日", enabled: true, period: 5, color: "#ef4444", width: 2, style: "solid", opacity: 1 },
  { id: "ma-10", label: "10日", enabled: true, period: 10, color: "#22c55e", width: 2, style: "solid", opacity: 1 },
  { id: "ma-20", label: "20日", enabled: true, period: 20, color: "#2563eb", width: 2, style: "solid", opacity: 1 },
  { id: "ma-50", label: "50日", enabled: true, period: 50, color: "#a855f7", width: 2, style: "solid", opacity: 1 },
  { id: "ma-100", label: "100日", enabled: true, period: 100, color: "#f59e0b", width: 2, style: "solid", opacity: 1 },
];

const DEFAULT_CHART_APPEARANCE_DRAFT: ChartAppearanceDraft = {
  theme: "dark",
  gridVisible: true,
  gridDensity: "medium",
  bullishColor: "#22c55e",
  bearishColor: "#ef4444",
};

const DEFAULT_TRADING_SETTINGS_DRAFT: TradingSettingsDraft = {
  executionTiming: "next-open",
  drawRateThreshold: DEFAULT_TRADE_DRAW_RATE_THRESHOLD,
};

const DEFAULT_VIEW_SETTINGS_DRAFT: ViewSettingsDraft = {
  displayBarsMode: "auto",
  fixedDisplayBars: 100,
  initialPositionMode: "latest",
  initialPositionOffsetBars: 100,
};

const DEFAULT_CHART_VIEW_STATE: ChartViewState = {
  displayBarsByKey: {},
  anchorDateByKey: {},
};

const chartThemeLabels: Record<ChartTheme, string> = {
  dark: "ダーク",
  "dark-blue": "ダークブルー",
  black: "ブラック",
  light: "ライト",
  "light-gray": "ライトグレー",
  ivory: "アイボリー",
};

const chartColorPresets = [
  {
    id: "tradingview",
    label: "緑 / 赤",
    labelEn: "Green / Red",
    description: "一般的な海外チャート風",
    descriptionEn: "Common global chart style",
    bullishColor: "#22c55e",
    bearishColor: "#ef4444",
  },
  {
    id: "japanese-red-blue",
    label: "赤 / 青",
    labelEn: "Red / Blue",
    description: "日本株チャート風",
    descriptionEn: "Japanese stock chart style",
    bullishColor: "#ef4444",
    bearishColor: "#2563eb",
  },
  {
    id: "red-green",
    label: "赤 / 緑",
    labelEn: "Red / Green",
    description: "国内ツールで見かける配色",
    descriptionEn: "Often used in Japanese tools",
    bullishColor: "#ef4444",
    bearishColor: "#16a34a",
  },
  {
    id: "blue-red",
    label: "青 / 赤",
    labelEn: "Blue / Red",
    description: "寒色系の上昇色",
    descriptionEn: "Cool color for rising candles",
    bullishColor: "#2563eb",
    bearishColor: "#ef4444",
  },
  {
    id: "black-gray",
    label: "黒 / グレー",
    labelEn: "Black / Gray",
    description: "白背景向けモノクロ風",
    descriptionEn: "Monochrome style for light themes",
    bullishColor: "#111827",
    bearishColor: "#9ca3af",
  },
];

const maLineStyleLabels: Record<MaLineStyleOption, string> = {
  solid: "実線",
  dotted: "点線",
  dashed: "破線",
  "large-dashed": "長い破線",
  "sparse-dotted": "粗い点線",
};

const paintMarkTypeLabels: Record<PaintMarkType, string> = {
  up: "買い候補",
  down: "売り候補",
  memo: "文章メモ",
};

const paintPracticeTools: Array<{
  value: PaintPracticeTool;
  label: string;
  icon: string;
}> = [
  { value: "line", label: "直線", icon: "／" },
  { value: "curve", label: "曲線", icon: "⌁" },
  { value: "freehand", label: "フリーハンド", icon: "〰" },
  { value: "arrow", label: "矢印", icon: "↗" },
  { value: "ellipse", label: "丸・楕円", icon: "○" },
  { value: "rectangle", label: "四角", icon: "□" },
  { value: "text", label: "テキスト", icon: "T" },
  { value: "eraser", label: "消しゴム", icon: "" },
];

const paintPracticeColors = [
  "#22c55e",
  "#ef4444",
  "#facc15",
  "#3b82f6",
  "#a855f7",
  "#f8fafc",
  "#111827",
];

function loadPaintCustomColors() {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(PAINT_CUSTOM_COLORS_STORAGE_KEY) ?? "[]"
    );
    if (!Array.isArray(stored)) return [];

    return stored.filter(
      (color): color is string =>
        typeof color === "string" &&
        /^#[0-9a-f]{6}$/i.test(color) &&
        !paintPracticeColors.includes(color.toLowerCase())
    );
  } catch {
    return [];
  }
}

function loadPaintToolColors(): PaintToolColorMap {
  if (typeof window === "undefined") return {};

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(PAINT_TOOL_COLORS_STORAGE_KEY) ?? "{}"
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }

    const colors: PaintToolColorMap = {};
    for (const tool of paintPracticeTools) {
      const color = (stored as Record<string, unknown>)[tool.value];
      if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
        colors[tool.value] = color.toLowerCase();
      }
    }

    return colors;
  } catch {
    return {};
  }
}

const EMPTY_PAINT_MARKS: PaintMark[] = [];

function getPaintMarkDisplayText(mark: PaintMark) {
  if (mark.text) return mark.text;
  if (mark.type === "up") return "買い候補";
  if (mark.type === "down") return "売り候補";

  return "メモ";
}

type StoredChartSettings = {
  maSettings: MaDisplaySetting[];
  appearanceSettings: ChartAppearanceDraft;
  tradingSettings: TradingSettingsDraft;
  viewSettings: ViewSettingsDraft;
  language: AppLanguage;
};

function normalizeLanguage(value: unknown): AppLanguage {
  return value === "en" ? "en" : "ja";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(max, Math.max(min, value));
}

function normalizeMaDisplaySetting(
  value: unknown,
  index: number
): MaDisplaySetting | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<MaDisplaySetting>;
  const period = Math.floor(clampNumber(item.period, 1, 250, 5));
  const width = Math.round(clampNumber(item.width, 1, 4, 2));
  const style: MaLineStyleOption =
    item.style === "dotted" ||
    item.style === "dashed" ||
    item.style === "large-dashed" ||
    item.style === "sparse-dotted" ||
    item.style === "solid"
      ? item.style
      : "solid";

  return {
    id: typeof item.id === "string" ? item.id : `ma-${index + 1}`,
    label: typeof item.label === "string" ? item.label : `${period}日`,
    enabled: typeof item.enabled === "boolean" ? item.enabled : true,
    period,
    color:
      typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color)
        ? item.color
        : DEFAULT_MA_DISPLAY_SETTINGS[
            index % DEFAULT_MA_DISPLAY_SETTINGS.length
          ].color,
    width,
    style,
    opacity: clampNumber(item.opacity, 0.2, 1, 1),
  };
}

function normalizeChartAppearanceDraft(value: unknown): ChartAppearanceDraft {
  if (!value || typeof value !== "object") {
    return DEFAULT_CHART_APPEARANCE_DRAFT;
  }

  const item = value as Partial<ChartAppearanceDraft>;
  const theme: ChartTheme =
    item.theme === "dark" ||
    item.theme === "dark-blue" ||
    item.theme === "black" ||
    item.theme === "light" ||
    item.theme === "light-gray" ||
    item.theme === "ivory"
      ? item.theme
      : DEFAULT_CHART_APPEARANCE_DRAFT.theme;
  const gridDensity: SettingSize =
    item.gridDensity === "small" ||
    item.gridDensity === "medium" ||
    item.gridDensity === "large"
      ? item.gridDensity
      : DEFAULT_CHART_APPEARANCE_DRAFT.gridDensity;
  const colorPattern = /^#[0-9a-fA-F]{6}$/;

  return {
    theme,
    gridVisible:
      typeof item.gridVisible === "boolean"
        ? item.gridVisible
        : DEFAULT_CHART_APPEARANCE_DRAFT.gridVisible,
    gridDensity,
    bullishColor:
      typeof item.bullishColor === "string" &&
      colorPattern.test(item.bullishColor)
        ? item.bullishColor
        : DEFAULT_CHART_APPEARANCE_DRAFT.bullishColor,
    bearishColor:
      typeof item.bearishColor === "string" &&
      colorPattern.test(item.bearishColor)
        ? item.bearishColor
        : DEFAULT_CHART_APPEARANCE_DRAFT.bearishColor,
  };
}

function normalizeTradingSettingsDraft(value: unknown): TradingSettingsDraft {
  if (!value || typeof value !== "object") {
    return DEFAULT_TRADING_SETTINGS_DRAFT;
  }

  const item = value as Partial<TradingSettingsDraft>;

  return {
    executionTiming:
      item.executionTiming === "same-close" ? "same-close" : "next-open",
    drawRateThreshold: clampNumber(
      item.drawRateThreshold,
      0,
      0.2,
      DEFAULT_TRADE_DRAW_RATE_THRESHOLD
    ),
  };
}

function normalizeViewSettingsDraft(value: unknown): ViewSettingsDraft {
  if (!value || typeof value !== "object") {
    return DEFAULT_VIEW_SETTINGS_DRAFT;
  }

  const item = value as Partial<ViewSettingsDraft>;
  const displayBarsMode: DisplayBarsMode =
    item.displayBarsMode === "remember" || item.displayBarsMode === "fixed"
      ? item.displayBarsMode
      : "auto";
  const initialPositionMode: InitialPositionMode =
    item.initialPositionMode === "offset" ||
    item.initialPositionMode === "remember" ||
    item.initialPositionMode === "earliest"
      ? item.initialPositionMode
      : "latest";

  return {
    displayBarsMode,
    fixedDisplayBars: Math.round(
      clampNumber(item.fixedDisplayBars, 30, MAX_AUTO_DISPLAY_BARS, 100)
    ),
    initialPositionMode,
    initialPositionOffsetBars: Math.round(
      clampNumber(item.initialPositionOffsetBars, 0, 5000, 100)
    ),
  };
}

function loadChartSettingsFromStorage(): StoredChartSettings {
  if (typeof window === "undefined") {
    return {
      maSettings: DEFAULT_MA_DISPLAY_SETTINGS,
      appearanceSettings: DEFAULT_CHART_APPEARANCE_DRAFT,
      tradingSettings: DEFAULT_TRADING_SETTINGS_DRAFT,
      viewSettings: DEFAULT_VIEW_SETTINGS_DRAFT,
      language: "ja",
    };
  }

  try {
    const raw = window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        maSettings: DEFAULT_MA_DISPLAY_SETTINGS,
        appearanceSettings: DEFAULT_CHART_APPEARANCE_DRAFT,
        tradingSettings: DEFAULT_TRADING_SETTINGS_DRAFT,
        viewSettings: DEFAULT_VIEW_SETTINGS_DRAFT,
        language: "ja",
      };
    }

    const parsed = JSON.parse(raw) as Partial<StoredChartSettings>;
    const maSettings = Array.isArray(parsed.maSettings)
      ? parsed.maSettings
          .map((setting, index) => normalizeMaDisplaySetting(setting, index))
          .filter((setting): setting is MaDisplaySetting => setting !== null)
      : DEFAULT_MA_DISPLAY_SETTINGS;

    return {
      maSettings: maSettings.length > 0 ? maSettings : DEFAULT_MA_DISPLAY_SETTINGS,
      appearanceSettings: normalizeChartAppearanceDraft(
        parsed.appearanceSettings
      ),
      tradingSettings: normalizeTradingSettingsDraft(parsed.tradingSettings),
      viewSettings: normalizeViewSettingsDraft(parsed.viewSettings),
      language: normalizeLanguage(parsed.language),
    };
  } catch (error) {
    console.warn("Failed to load chart settings", error);

    return {
      maSettings: DEFAULT_MA_DISPLAY_SETTINGS,
      appearanceSettings: DEFAULT_CHART_APPEARANCE_DRAFT,
      tradingSettings: DEFAULT_TRADING_SETTINGS_DRAFT,
      viewSettings: DEFAULT_VIEW_SETTINGS_DRAFT,
      language: "ja",
    };
  }
}

function saveChartSettingsToStorage(settings: StoredChartSettings) {
  try {
    window.localStorage.setItem(
      CHART_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.warn("Failed to save chart settings", error);
  }
}

function loadChartViewStateFromStorage(): ChartViewState {
  if (typeof window === "undefined") return DEFAULT_CHART_VIEW_STATE;

  try {
    const raw = window.localStorage.getItem(CHART_VIEW_STATE_STORAGE_KEY);
    if (!raw) return DEFAULT_CHART_VIEW_STATE;

    const parsed = JSON.parse(raw) as Partial<ChartViewState>;
    const displayBarsByKey =
      parsed.displayBarsByKey && typeof parsed.displayBarsByKey === "object"
        ? Object.fromEntries(
            Object.entries(parsed.displayBarsByKey)
              .map(([key, value]) => [
                key,
                Math.round(clampNumber(value, 1, MAX_AUTO_DISPLAY_BARS, 100)),
              ])
              .filter(([key]) => typeof key === "string" && key.length > 0)
          )
        : {};
    const anchorDateByKey =
      parsed.anchorDateByKey && typeof parsed.anchorDateByKey === "object"
        ? Object.fromEntries(
            Object.entries(parsed.anchorDateByKey).filter(
              ([key, value]) =>
                typeof key === "string" &&
                key.length > 0 &&
                typeof value === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(value)
            )
          )
        : {};

    return { displayBarsByKey, anchorDateByKey };
  } catch (error) {
    console.warn("Failed to load chart view state", error);
    return DEFAULT_CHART_VIEW_STATE;
  }
}

function saveChartViewStateToStorage(state: ChartViewState) {
  try {
    window.localStorage.setItem(
      CHART_VIEW_STATE_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    console.warn("Failed to save chart view state", error);
  }
}

function getChartViewStateKey(dataPath: string, timeframe: Timeframe) {
  return `${dataPath}::${timeframe}`;
}

function pickInitialAnchorDate(
  candles: Candle[],
  displayBars: number,
  settings: ViewSettingsDraft,
  rememberedAnchorDate?: string
) {
  if (candles.length === 0) return "";

  if (settings.initialPositionMode === "remember" && rememberedAnchorDate) {
    return rememberedAnchorDate;
  }

  if (settings.initialPositionMode === "earliest") {
    return candles[Math.min(candles.length - 1, Math.max(0, displayBars - 1))]
      ?.time ?? "";
  }

  if (settings.initialPositionMode === "offset") {
    const index = Math.max(
      0,
      candles.length - 1 - settings.initialPositionOffsetBars
    );

    return candles[index]?.time ?? candles[candles.length - 1]?.time ?? "";
  }

  return candles[candles.length - 1]?.time ?? "";
}

function isLightChartTheme(theme: ChartTheme) {
  return theme === "light" || theme === "light-gray" || theme === "ivory";
}

function getChartBackgroundColor(theme: ChartTheme) {
  if (theme === "black") return "#020617";
  if (theme === "dark-blue") return "#0b1730";
  if (theme === "light") return "#ffffff";
  if (theme === "light-gray") return "#f8fafc";
  if (theme === "ivory") return "#fffaf0";

  return "#111827";
}

function getChartTextColor(theme: ChartTheme) {
  return isLightChartTheme(theme) ? "#111827" : "#d1d5db";
}

function getChartBorderColor(theme: ChartTheme) {
  return isLightChartTheme(theme) ? "#cbd5e1" : "#4b5563";
}

function getGridLineColor(appearance: ChartAppearanceDraft) {
  if (!appearance.gridVisible) return "rgba(15, 23, 42, 0)";

  if (isLightChartTheme(appearance.theme)) {
    if (appearance.gridDensity === "small") return "rgba(100, 116, 139, 0.16)";
    if (appearance.gridDensity === "large") return "rgba(100, 116, 139, 0.36)";

    return "rgba(100, 116, 139, 0.24)";
  }

  if (appearance.gridDensity === "small") return "rgba(148, 163, 184, 0.12)";
  if (appearance.gridDensity === "large") return "rgba(148, 163, 184, 0.34)";

  return "rgba(148, 163, 184, 0.22)";
}

function getAppBackgroundColor(theme: ChartTheme) {
  if (theme === "black") return "#020617";
  if (theme === "dark-blue") return "#081226";
  if (theme === "light") return "#e5e7eb";
  if (theme === "light-gray") return "#e2e8f0";
  if (theme === "ivory") return "#f5efe1";

  return "#0f172a";
}

function getAppThemeStyle(
  theme: ChartTheme
): CSSProperties & Record<`--${string}`, string> {
  if (theme === "light" || theme === "light-gray") {
    return {
      "--app-bg": theme === "light" ? "#e5e7eb" : "#e2e8f0",
      "--panel-bg": "#f8fafc",
      "--panel-muted": "#eef2f7",
      "--control-bg": "#ffffff",
      "--control-active-bg": "#2563eb",
      "--border": "#cbd5e1",
      "--border-strong": "#94a3b8",
      "--text": "#0f172a",
      "--muted": "#64748b",
      "--blue": "#2563eb",
      "--green": "#16a34a",
      "--red": "#dc2626",
    };
  }

  if (theme === "ivory") {
    return {
      "--app-bg": "#f5efe1",
      "--panel-bg": "#fffaf0",
      "--panel-muted": "#f2ead8",
      "--control-bg": "#fff7e6",
      "--control-active-bg": "#2563eb",
      "--border": "#d8cbb4",
      "--border-strong": "#b9a98c",
      "--text": "#1f2937",
      "--muted": "#7c6f5b",
      "--blue": "#2563eb",
      "--green": "#16a34a",
      "--red": "#dc2626",
    };
  }

  if (theme === "black") {
    return {
      "--app-bg": "#020617",
      "--panel-bg": "#050912",
      "--panel-muted": "#0b1220",
      "--control-bg": "#0f172a",
      "--control-active-bg": "#1d4ed8",
      "--border": "#1e293b",
      "--border-strong": "#334155",
      "--text": "#e5e7eb",
      "--muted": "#94a3b8",
      "--blue": "#3b82f6",
      "--green": "#30c77b",
      "--red": "#ef6464",
    };
  }

  if (theme === "dark-blue") {
    return {
      "--app-bg": "#081226",
      "--panel-bg": "#0d1a30",
      "--panel-muted": "#132540",
      "--control-bg": "#10203a",
      "--control-active-bg": "#2563eb",
      "--border": "#263b59",
      "--border-strong": "#36547a",
      "--text": "#e5e7eb",
      "--muted": "#9fb0c8",
      "--blue": "#3b82f6",
      "--green": "#30c77b",
      "--red": "#ef6464",
    };
  }

  return {
    "--app-bg": "#0f172a",
    "--panel-bg": "#121923",
    "--panel-muted": "#18212d",
    "--control-bg": "#17212e",
    "--control-active-bg": "#2d6fd2",
    "--border": "#2b3746",
    "--border-strong": "#3b4b5e",
    "--text": "#e5e7eb",
    "--muted": "#93a0b2",
    "--blue": "#3b82f6",
    "--green": "#30c77b",
    "--red": "#ef6464",
  };
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const alpha = clampNumber(opacity, 0.2, 1, 1);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toLineWidth(width: number): 1 | 2 | 3 | 4 {
  const normalized = Math.round(clampNumber(width, 1, 4, 2));

  return normalized as 1 | 2 | 3 | 4;
}

function toLineStyle(style: MaLineStyleOption) {
  if (style === "dotted") return LineStyle.Dotted;
  if (style === "dashed") return LineStyle.Dashed;
  if (style === "large-dashed") return LineStyle.LargeDashed;
  if (style === "sparse-dotted") return LineStyle.SparseDotted;

  return LineStyle.Solid;
}

function getLineStyleDashArray(style: MaLineStyleOption) {
  if (style === "dotted") return "2 5";
  if (style === "dashed") return "8 6";
  if (style === "large-dashed") return "14 7";
  if (style === "sparse-dotted") return "2 10";

  return undefined;
}

function LineStylePreview({
  style,
  color = "#60a5fa",
  width = 2,
  muted = false,
  label,
}: {
  style: MaLineStyleOption;
  color?: string;
  width?: number;
  muted?: boolean;
  label?: string;
}) {
  const strokeColor = muted ? "#64748b" : color;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        color: muted ? "#94a3b8" : "#cbd5e1",
        fontSize: "12px",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="74" height="16" viewBox="0 0 74 16" aria-hidden="true">
        <line
          x1="4"
          y1="8"
          x2="70"
          y2="8"
          stroke={strokeColor}
          strokeWidth={Math.max(1, Math.min(4, Math.round(width)))}
          strokeLinecap="round"
          strokeDasharray={getLineStyleDashArray(style)}
        />
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}

const displayBarsOptions: Array<{ value: DisplayBarsOption; label: string }> = [
  { value: "auto", label: "自動" },
  { value: "remember", label: "前回" },
  { value: "50", label: "50本" },
  { value: "75", label: "75本" },
  { value: "100", label: "100本" },
  { value: "150", label: "150本" },
  { value: "200", label: "200本" },
];

function getStockInfoFromPath(path: string) {
  const fileName = decodeURIComponent(path.split("/").pop() ?? "");
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const [code = "", name = ""] = baseName.split("_");

  return { code, name };
}

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function toLocalDate(dateText: string) {
  return new Date(`${dateText}T00:00:00`);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateWithWeekday(dateText: string) {
  if (!dateText) return "";

  const date = toLocalDate(dateText);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];

  return `${year}/${month}/${day}（${weekday}）`;
}

function chartTimeToDateText(time: Time | undefined) {
  if (!time) return "";
  if (typeof time === "string") return time;
  if (typeof time === "number") {
    return formatDate(new Date(time * 1000));
  }

  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(
    time.day
  ).padStart(2, "0")}`;
}

function calculateMA(data: DisplayCandle[], period: number): MaPoint[] {
  return data
    .map((item, index) => {
      if (index < period - 1) return null;

      const sum = data
        .slice(index - period + 1, index + 1)
        .reduce((acc, cur) => acc + cur.close, 0);

      return {
        time: item.time,
        value: sum / period,
      };
    })
    .filter((item): item is MaPoint => item !== null);
}

function getWeekEndKey(dateText: string) {
  const date = toLocalDate(dateText);
  const diffToSunday = 7 - date.getDay();
  date.setDate(date.getDate() + (diffToSunday === 7 ? 0 : diffToSunday));

  return formatDate(date);
}

function getMonthEndKey(dateText: string) {
  const date = toLocalDate(dateText);

  return formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function aggregateCandles(
  candles: Candle[],
  timeframe: Timeframe
): DisplayCandle[] {
  if (timeframe === "daily") {
    return candles.map((candle) => ({
      ...candle,
      sourceStartTime: candle.time,
      sourceEndTime: candle.time,
    }));
  }

  const grouped = new Map<string, DisplayCandle>();

  candles.forEach((candle) => {
    const key =
      timeframe === "weekly"
        ? getWeekEndKey(candle.time)
        : getMonthEndKey(candle.time);
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...candle,
        sourceStartTime: candle.time,
        sourceEndTime: candle.time,
      });
      return;
    }

    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.time = candle.time;
    current.sourceEndTime = candle.time;
  });

  return Array.from(grouped.values());
}

function calculateAutoDisplayBars(width: number) {
  if (!width) return 100;

  return Math.max(
    MIN_AUTO_DISPLAY_BARS,
    Math.min(MAX_AUTO_DISPLAY_BARS, Math.floor(width / BAR_SPACING) - 10)
  );
}

function findEndIndexByAnchor(
  candles: DisplayCandle[],
  anchorDate: string,
  displayBars: number
) {
  let endIndex = 0;

  for (let index = 0; index < candles.length; index += 1) {
    if (candles[index].time <= anchorDate) {
      endIndex = index + 1;
    } else {
      break;
    }
  }

  return endIndex || Math.min(displayBars, candles.length);
}

function findDailyDateOnOrBefore(candles: Candle[], targetDate: string) {
  let matchedDate = "";

  for (const candle of candles) {
    if (candle.time <= targetDate) {
      matchedDate = candle.time;
    } else {
      break;
    }
  }

  return matchedDate;
}

function getCalendarCells(monthText: string) {
  const [year, month] = monthText.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0);
  const cells: Array<string | null> = [];

  for (let index = 0; index < firstDate.getDay(); index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= lastDate.getDate(); day += 1) {
    cells.push(formatDate(new Date(year, month - 1, day)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function shiftCalendarMonth(monthText: string, amount: number) {
  const [year, month] = monthText.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);

  return formatDate(date).slice(0, 7);
}

export default function App() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintTextInputRef = useRef<HTMLInputElement | null>(null);
  const paintPointerActiveRef = useRef(false);
  const customColorEditingIndexRef = useRef<number | null>(null);
  const lastChartWidthRef = useRef(0);
  const wheelNavigationAccumulatorRef = useRef(0);
  const navigateRef = useRef<((step: number) => void) | null>(null);
  const jumpToDateRef = useRef<((date: string) => void) | null>(null);
  const selectedChartDateRef = useRef("");
  const processPendingOrderRef = useRef<
    ((reachedDate: string, dailyCandles: Candle[]) => void) | null
  >(null);
  const processedOrderIdsRef = useRef(new Set<string>());
  const dailyCandlesCacheRef = useRef(new Map<string, Candle[]>());
  const anchorDailyDateRef = useRef<string | null>(null);
  const returnDailyDateRef = useRef<string | null>(null);
  const upperTimeframeMovedRef = useRef(false);
  const ignoreNextRangeSyncRef = useRef(false);
  const timeframeSwitchSyncRef = useRef(false);
  const visibleLogicalRangeRef = useRef<VisibleLogicalRange | null>(null);
  const paintPracticeChartRangeRef = useRef<VisibleLogicalRange | null>(null);
  const preserveVisibleRangeTransitionRef = useRef(false);
  const [selectedDataPath, setSelectedDataPath] = useState<string>(DATA_FILES[0]);
  const selectedInstrument = getInstrumentDefinition(selectedDataPath);
  const [currentDate, setCurrentDate] = useState("");
  const [currentOhlc, setCurrentOhlc] = useState<Candle | null>(null);
  const [dateInputValue, setDateInputValue] = useState("");
  const [selectedChartDate, setSelectedChartDate] = useState("");
  const [tradingDates, setTradingDates] = useState<Set<string>>(new Set());
  const [calendarRange, setCalendarRange] = useState({ min: "", max: "" });
  const [calendarMonth, setCalendarMonth] = useState(
    formatDate(new Date()).slice(0, 7)
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");
  const [displayBarsOption, setDisplayBarsOption] =
    useState<DisplayBarsOption>(() => {
      const savedViewSettings = loadChartSettingsFromStorage().viewSettings;
      if (savedViewSettings.displayBarsMode === "remember") return "remember";
      if (savedViewSettings.displayBarsMode === "fixed") {
        const fixedValue = String(
          savedViewSettings.fixedDisplayBars
        ) as DisplayBarsOption;
        return displayBarsOptions.some((option) => option.value === fixedValue)
          ? fixedValue
          : "100";
      }

      return "auto";
    });
  const [autoDisplayBars, setAutoDisplayBars] = useState(100);
  const [chartViewState, setChartViewState] = useState<ChartViewState>(
    loadChartViewStateFromStorage
  );
  const chartViewStateRef = useRef(chartViewState);
  const [visibleBarsCount, setVisibleBarsCount] = useState(0);
  const [orderAction, setOrderAction] = useState<OrderAction>("add-short");
  const [orderLots, setOrderLots] = useState(1);
  const [sharesPerLot, setSharesPerLot] = useState(
    () => getInstrumentDefinition(DATA_FILES[0]).defaultLotSize
  );
  const [showProfit, setShowProfit] = useState(true);
  const [showTradeScore, setShowTradeScore] = useState(true);
  const [isTradePanelOpen, setIsTradePanelOpen] = useState(false);
  const tradePanelBeforePaintRef = useRef(true);
  const [isPaintPracticeOpen, setIsPaintPracticeOpen] = useState(false);
  const [isPaintCanvasActive, setIsPaintCanvasActive] = useState(false);
  const [isPaintCanvasReady, setIsPaintCanvasReady] = useState(false);
  const [isPaintCapturing, setIsPaintCapturing] = useState(false);
  const [paintToolColors, setPaintToolColors] = useState<PaintToolColorMap>(
    loadPaintToolColors
  );
  const [paintPracticeTool, setPaintPracticeTool] =
    useState<PaintPracticeTool>("line");
  const [paintPracticeColor, setPaintPracticeColor] = useState(
    () => loadPaintToolColors().line ?? paintPracticeColors[0]
  );
  const [paintCustomColors, setPaintCustomColors] = useState<string[]>(
    loadPaintCustomColors
  );
  const [paintPracticeWidth, setPaintPracticeWidth] = useState(3);
  const [paintPracticeNote, setPaintPracticeNote] = useState("");
  const [paintCanvasZoom, setPaintCanvasZoom] = useState(1);
  const [paintBackgroundDataUrl, setPaintBackgroundDataUrl] = useState("");
  const [paintObjects, setPaintObjects] = useState<PaintDrawingObject[]>([]);
  const [paintUndoStack, setPaintUndoStack] = useState<
    PaintDrawingObject[][]
  >([]);
  const [paintRedoStack, setPaintRedoStack] = useState<
    PaintDrawingObject[][]
  >([]);
  const [paintDraftObject, setPaintDraftObject] =
    useState<PaintDrawingObject | null>(null);
  const [paintTextEditor, setPaintTextEditor] =
    useState<PaintTextEditor | null>(null);
  const paintTextEditorPositionKey = paintTextEditor
    ? `${paintTextEditor.left}:${paintTextEditor.top}`
    : "";
  const [paintSavedItems, setPaintSavedItems] = useState<
    SavedPaintPractice[]
  >([]);
  const [isPaintHistoryOpen, setIsPaintHistoryOpen] = useState(false);
  const [paintStatusMessage, setPaintStatusMessage] = useState("");
  const [canNavigateForward, setCanNavigateForward] = useState(false);
  const [selectedDailyCandles, setSelectedDailyCandles] = useState<Candle[]>([]);
  const [tradingBooks, setTradingBooks] = useState<
    Record<string, TradingBook>
  >(() => loadTradingBooksFromStorage());
  const [orderMessage, setOrderMessage] = useState("");
  const [orderMessageExpiresOn, setOrderMessageExpiresOn] = useState("");
  const [isTradeLogOpen, setIsTradeLogOpen] = useState(false);
  const [activeTradeLogId, setActiveTradeLogId] = useState("");
  const [paintMarksByStock, setPaintMarksByStock] = useState<
    Record<string, PaintMark[]>
  >(() => loadPaintMarksFromStorage());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAppearanceSettingsOpen, setIsAppearanceSettingsOpen] =
    useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled);
  const [maDisplaySettings, setMaDisplaySettings] = useState<
    MaDisplaySetting[]
  >(() => loadChartSettingsFromStorage().maSettings);
  const [appearanceSettings, setAppearanceSettings] =
    useState<ChartAppearanceDraft>(
      () => loadChartSettingsFromStorage().appearanceSettings
    );
  const [tradingSettings, setTradingSettings] =
    useState<TradingSettingsDraft>(
      () => loadChartSettingsFromStorage().tradingSettings
    );
  const [viewSettings, setViewSettings] = useState<ViewSettingsDraft>(
    () => loadChartSettingsFromStorage().viewSettings
  );
  const [language, setLanguage] = useState<AppLanguage>(
    () => loadChartSettingsFromStorage().language
  );
  const isEnglish = language === "en";
  const ui = {
    stock: isEnglish ? "Symbol" : "銘柄",
    timeframe: isEnglish ? "Timeframe" : "足種",
    display: isEnglish ? "Bars" : "表示",
    visibleBars: isEnglish ? "Showing" : "表示中",
    fullscreen: isEnglish ? "Fullscreen" : "全画面",
    exitFullscreen: isEnglish ? "Exit Fullscreen" : "全画面解除",
    soundOn: isEnglish ? "Sound On" : "音あり",
    muted: isEnglish ? "Muted" : "ミュート",
    settings: isEnglish ? "Settings" : "設定",
    settingsDescription: isEnglish
      ? "Changes are applied to the chart. Save to keep them for the next launch."
      : "変更した設定はチャートへ反映されます。保存すると次回起動時も維持されます。",
    language: isEnglish ? "Language" : "言語",
    movingAverages: isEnglish ? "Moving Averages" : "移動平均線",
    chartAppearance: isEnglish ? "Chart Appearance" : "チャート外観",
    tradeSettings: isEnglish ? "Trading" : "売買設定",
    tradePractice: isEnglish ? "Trade Practice" : "売買練習",
    currentPosition: isEnglish ? "Current Position" : "現在の建玉",
    shortLots: isEnglish ? "Short" : "売玉",
    longLots: isEnglish ? "Long" : "買玉",
    profit: isEnglish ? "Profit" : "損益",
    show: isEnglish ? "Show" : "表示",
    hide: isEnglish ? "Hide" : "非表示",
    realizedProfit: isEnglish ? "Realized" : "確定損益",
    unrealizedProfit: isEnglish ? "Unrealized" : "含み損益",
    totalProfit: isEnglish ? "Total" : "総合損益",
    order: isEnglish ? "Order" : "注文",
    quantitySettings: isEnglish ? "Quantity Settings" : "数量設定",
    orderLots: isEnglish ? "Order Lots" : "注文玉数",
    quantityPerLot: isEnglish ? "Quantity per Lot" : "1玉あたり数量",
    calculationUnit: isEnglish ? "Calculation Unit" : "計算単位",
    pendingOrders: isEnglish ? "Pending Orders" : "注文待機中",
    cancel: isEnglish ? "Cancel" : "取消",
    chartMemo: isEnglish ? "Chart Memo" : "チャートメモ",
    tradeLog: isEnglish ? "Trade Log" : "売買ログ",
    exportCsv: isEnglish ? "Export CSV" : "CSV出力",
    resetPractice: isEnglish ? "Reset Practice" : "練習をリセット",
    backOneBar: isEnglish ? "Back 1" : "1本戻る",
    forwardOneBar: isEnglish ? "Forward 1" : "1本進む",
    currentDate: isEnglish ? "Current Date" : "現在日付",
    loading: isEnglish ? "Loading" : "読み込み中",
    selectCandle: isEnglish ? "Select Candlestick" : "ローソク足を選択",
    selected: isEnglish ? "Selected" : "選択",
    moveToRightEdge: isEnglish ? "Move to right edge" : "右端へ移動",
    open: isEnglish ? "Open" : "始値",
    high: isEnglish ? "High" : "高値",
    low: isEnglish ? "Low" : "安値",
    closePrice: isEnglish ? "Close" : "終値",
    delete: isEnglish ? "Delete" : "削除",
    orderedDate: isEnglish ? "Ordered" : "注文日",
    executedDate: isEnglish ? "Executed" : "約定日",
    executionPrice: isEnglish ? "Execution Price" : "約定価格",
    related: isEnglish ? "related" : "対応",
    tradeScore: isEnglish ? "Results" : "勝敗",
    win: isEnglish ? "Win" : "勝ち",
    loss: isEnglish ? "Loss" : "負け",
    draw: isEnglish ? "Draw" : "分け",
    closedLots: isEnglish ? "Closed lots" : "返済した玉",
    paintPractice: isEnglish ? "Paint Practice" : "ペイント練習",
    paintCanvas: isEnglish ? "Paint Canvas" : "ペイントキャンバス",
    captureChart: isEnglish
      ? "Capture current chart to start"
      : "現在のチャートをスクショして開始",
    replaceChartImage: isEnglish
      ? "Replace with current chart image"
      : "現在のチャート画像へ置き換え",
    paintPracticeDescription: isEnglish
      ? "Capture the current chart as an image, then draw lines and notes for review."
      : "現在のチャートを画像として取り込み、線やメモを書き込んで振り返ります。",
    captureHelp: isEnglish
      ? "Adjust the date, position, and scale before capturing."
      : "押す前に日付・表示位置・縮尺を調整できます。",
    drawingTools: isEnglish ? "Drawing Tools" : "描画ツール",
    color: isEnglish ? "Color" : "色",
    lineWidth: isEnglish ? "Line Width" : "線の太さ",
    undo: isEnglish ? "Undo" : "元に戻す",
    redo: isEnglish ? "Redo" : "やり直し",
    clearAll: isEnglish ? "Clear All" : "全消去",
    downloadPng: isEnglish ? "Download PNG" : "PNGダウンロード",
    savePaint: isEnglish ? "Save Paint" : "ペイントを保存",
    viewHistory: isEnglish ? "View History" : "履歴を見る",
    paintHistory: isEnglish ? "Paint History" : "ペイント履歴",
    noSavedPaint: isEnglish
      ? "No saved paint practices"
      : "保存されたペイントはありません",
    load: isEnglish ? "Load" : "読み込む",
    addText: isEnglish ? "Add" : "追加",
    targetDate: isEnglish ? "Target Date" : "対象日",
    buyCandidate: isEnglish ? "Buy Candidate" : "買い候補",
    sellCandidate: isEnglish ? "Sell Candidate" : "売り候補",
    addMemo: isEnglish ? "Add Memo" : "メモ追加",
    clearStockMemos: isEnglish
      ? "Clear all memos for this symbol"
      : "この銘柄のメモを全削除",
    save: isEnglish ? "Save" : "保存",
    close: isEnglish ? "Close" : "閉じる",
    daily: isEnglish ? "D" : "日足",
    weekly: isEnglish ? "W" : "週足",
    monthly: isEnglish ? "M" : "月足",
    autoBars: isEnglish ? "Auto" : "自動",
    barsSuffix: isEnglish ? " bars" : "本",
    nextOpen: isEnglish ? "Next trading day open" : "次の取引日の始値",
    sameClose: isEnglish ? "Same day close" : "当日の終値",
  };
  const paintPracticeToolLabels: Record<PaintPracticeTool, string> = {
    line: isEnglish ? "Line" : "直線",
    curve: isEnglish ? "Curve" : "曲線",
    freehand: isEnglish ? "Freehand" : "フリーハンド",
    arrow: isEnglish ? "Arrow" : "矢印",
    ellipse: isEnglish ? "Circle / Oval" : "丸・楕円",
    rectangle: isEnglish ? "Rectangle" : "四角",
    text: isEnglish ? "Text" : "テキスト",
    eraser: isEnglish ? "Eraser" : "消しゴム",
  };
  const displayBars =
    viewSettings.displayBarsMode === "auto"
      ? autoDisplayBars
      : viewSettings.displayBarsMode === "remember"
        ? (chartViewState.displayBarsByKey[
            getChartViewStateKey(selectedDataPath, timeframe)
          ] ?? autoDisplayBars)
        : viewSettings.fixedDisplayBars;
  const currentBook =
    tradingBooks[selectedDataPath] ?? createEmptyTradingBook();
  const currentPaintMarks = paintMarksByStock[selectedDataPath] ?? EMPTY_PAINT_MARKS;
  const paintTargetDate = selectedChartDate || dateInputValue;
  const selectedDatePaintMarks = paintTargetDate
    ? currentPaintMarks.filter((mark) => mark.date === paintTargetDate)
    : [];
  const isPaintDrawingReady = isPaintCanvasActive && isPaintCanvasReady;

  const playEffect = useCallback(
    (effect: SoundEffect) => playSoundEffect(effect, soundEnabled),
    [soundEnabled]
  );
  const showOrderMessage = useCallback((message: string, expiresOn = "") => {
    setOrderMessage(message);
    setOrderMessageExpiresOn(expiresOn);
  }, []);

  const displayedOrderMessage =
    orderMessageExpiresOn && dateInputValue && dateInputValue > orderMessageExpiresOn
      ? ""
      : orderMessage;

  const changeTimeframe = useCallback(
    (nextTimeframe: Timeframe) => {
      if (timeframe === nextTimeframe) return;

      const currentAnchor = dateInputValue || anchorDailyDateRef.current || "";
      if (timeframe === "daily") {
        returnDailyDateRef.current = currentAnchor;
        upperTimeframeMovedRef.current = false;
      }

      if (nextTimeframe === "daily") {
        const nextAnchor = upperTimeframeMovedRef.current
          ? anchorDailyDateRef.current
          : returnDailyDateRef.current;

        if (nextAnchor) {
          anchorDailyDateRef.current = nextAnchor;
        }
        returnDailyDateRef.current = null;
        upperTimeframeMovedRef.current = false;
      }

      timeframeSwitchSyncRef.current = true;
      window.setTimeout(() => {
        timeframeSwitchSyncRef.current = false;
      }, 450);
      setIsChartLoading(true);
      setTimeframe(nextTimeframe);
    },
    [dateInputValue, timeframe]
  );

  const rememberVisibleLogicalRange = useCallback((range: VisibleLogicalRange | null) => {
    if (!range) return null;

    const rememberedRange = { from: range.from, to: range.to };
    visibleLogicalRangeRef.current = rememberedRange;
    return rememberedRange;
  }, []);

  const getCurrentVisibleLogicalRange = useCallback(
    () => rememberVisibleLogicalRange(
      chartApiRef.current?.timeScale().getVisibleLogicalRange() ?? null
    ) ?? visibleLogicalRangeRef.current,
    [rememberVisibleLogicalRange]
  );

  const restoreVisibleLogicalRange = useCallback((range: VisibleLogicalRange | null) => {
    if (!range) return;
    preserveVisibleRangeTransitionRef.current = true;
    const applyRange = () => {
      const chart = chartApiRef.current;
      if (!chart) return;

      chart.timeScale().setVisibleLogicalRange(range);
      visibleLogicalRangeRef.current = range;
    };

    applyRange();
    requestAnimationFrame(() => {
      requestAnimationFrame(applyRange);
    });
    window.setTimeout(applyRange, 120);
    window.setTimeout(applyRange, 320);
    window.setTimeout(applyRange, 700);
    window.setTimeout(() => {
      preserveVisibleRangeTransitionRef.current = false;
    }, 1200);
  }, []);

  useEffect(() => {
    saveTradingBooksToStorage(tradingBooks);
  }, [tradingBooks]);

  useEffect(() => {
    savePaintMarksToStorage(paintMarksByStock);
  }, [paintMarksByStock]);

  useEffect(() => {
    chartViewStateRef.current = chartViewState;
    saveChartViewStateToStorage(chartViewState);
  }, [chartViewState]);

  useEffect(() => {
    window.localStorage.setItem(
      SOUND_ENABLED_STORAGE_KEY,
      String(soundEnabled)
    );
  }, [soundEnabled]);

  useEffect(() => {
    const syncViewportHeight = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty(
        "--app-height",
        `${height}px`
      );
      document.documentElement.style.setProperty(
        "--app-offset-top",
        `${offsetTop}px`
      );

      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    };

    const syncViewportHeightSoon = () => {
      syncViewportHeight();
      window.setTimeout(syncViewportHeight, 80);
      window.setTimeout(syncViewportHeight, 240);
      window.setTimeout(syncViewportHeight, 600);
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      syncViewportHeightSoon();
    };

    syncViewportHeightSoon();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("orientationchange", syncViewportHeightSoon);
    window.visualViewport?.addEventListener("resize", syncViewportHeightSoon);
    window.visualViewport?.addEventListener("scroll", syncViewportHeightSoon);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("orientationchange", syncViewportHeightSoon);
      window.visualViewport?.removeEventListener(
        "resize",
        syncViewportHeightSoon
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        syncViewportHeightSoon
      );
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      PAINT_CUSTOM_COLORS_STORAGE_KEY,
      JSON.stringify(paintCustomColors)
    );
  }, [paintCustomColors]);

  useEffect(() => {
    window.localStorage.setItem(
      PAINT_TOOL_COLORS_STORAGE_KEY,
      JSON.stringify(paintToolColors)
    );
  }, [paintToolColors]);

  useEffect(() => {
    if (!paintTextEditorPositionKey) return;

    const focusTextInput = () => {
      const input = paintTextInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
    };

    const frameId = requestAnimationFrame(focusTextInput);
    const timeoutId = window.setTimeout(focusTextInput, 0);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [paintTextEditorPositionKey]);

  useEffect(() => {
    processPendingOrderRef.current = (
      reachedDate: string,
      dailyCandles: Candle[]
    ) => {
      const dueOrders = currentBook.pendingOrders.filter(
        (order) =>
          reachedDate >= order.executeDate &&
          !processedOrderIdsRef.current.has(order.id)
      );
      if (dueOrders.length === 0) {
        return;
      }

      const candleByDate = new Map(dailyCandles.map((candle) => [candle.time, candle]));
      dueOrders.forEach((order) => processedOrderIdsRef.current.add(order.id));
      setTradingBooks((books) => {
        const book = books[selectedDataPath] ?? createEmptyTradingBook();
        const executableOrders = book.pendingOrders.filter((order) =>
          dueOrders.some((dueOrder) => dueOrder.id === order.id)
        );
        if (executableOrders.length === 0) return books;

        let shortPositions = [...book.shortPositions];
        let longPositions = [...book.longPositions];
        const newLogs: TradeLog[] = [];

        for (const pendingOrder of executableOrders) {
          const executionCandle = candleByDate.get(pendingOrder.executeDate);
          if (!executionCandle) continue;
          const executionPrice = getExecutionPrice(
            executionCandle,
            pendingOrder.executionTiming
          );
          let positionIds: string[] | undefined;
          let closesPositionIds: string[] | undefined;
          let closedPositions: PositionLot[] | undefined;

          const closingPositions =
            pendingOrder.action === "close-short"
              ? shortPositions.slice(0, pendingOrder.lots)
              : pendingOrder.action === "close-long"
                ? longPositions.slice(0, pendingOrder.lots)
                : [];
          const executionRealizedProfit =
            pendingOrder.action === "close-short"
              ? closingPositions.reduce(
                  (total, position) =>
                    total +
                    (position.entryPrice - executionPrice) *
                      position.sharesPerLot *
                      selectedInstrument.multiplier,
                  0
                )
              : pendingOrder.action === "close-long"
                ? closingPositions.reduce(
                    (total, position) =>
                      total +
                      (executionPrice - position.entryPrice) *
                        position.sharesPerLot *
                        selectedInstrument.multiplier,
                    0
                  )
                : null;

          if (pendingOrder.action === "add-short") {
            const createdPositions = Array.from({ length: pendingOrder.lots }, () => ({
                id: createId("short"),
                side: "short" as const,
                entryDate: pendingOrder.executeDate,
                entryPrice: executionPrice,
                sharesPerLot: pendingOrder.sharesPerLot,
              }));
            positionIds = createdPositions.map((position) => position.id);
            shortPositions.push(...createdPositions);
          } else if (pendingOrder.action === "add-long") {
            const createdPositions = Array.from({ length: pendingOrder.lots }, () => ({
                id: createId("long"),
                side: "long" as const,
                entryDate: pendingOrder.executeDate,
                entryPrice: executionPrice,
                sharesPerLot: pendingOrder.sharesPerLot,
              }));
            positionIds = createdPositions.map((position) => position.id);
            longPositions.push(...createdPositions);
          } else if (pendingOrder.action === "close-short") {
            closesPositionIds = closingPositions.map((position) => position.id);
            closedPositions = closingPositions;
            shortPositions = shortPositions.slice(pendingOrder.lots);
          } else {
            closesPositionIds = closingPositions.map((position) => position.id);
            closedPositions = closingPositions;
            longPositions = longPositions.slice(pendingOrder.lots);
          }

          newLogs.push({
            id: createId("trade"),
            action: pendingOrder.action,
            lots: pendingOrder.lots,
            orderedDate: pendingOrder.orderedDate,
            executionDate: pendingOrder.executeDate,
            executionPrice,
            shares: pendingOrder.shares,
            realizedProfit: executionRealizedProfit,
            positionIds,
            closesPositionIds,
            closedPositions,
          });
        }

        return {
          ...books,
          [selectedDataPath]: {
            shortPositions,
            longPositions,
            pendingOrder: null,
            pendingOrders: book.pendingOrders.filter(
              (order) => !dueOrders.some((dueOrder) => dueOrder.id === order.id)
            ),
            logs: [...newLogs.reverse(), ...book.logs],
          },
        };
      });

      const firstOrder = dueOrders[0];
      const firstCandle = candleByDate.get(firstOrder.executeDate);
      showOrderMessage(
        firstCandle
          ? `${formatDateWithWeekday(firstOrder.executeDate)}の${getExecutionTimingPriceLabel(
              firstOrder.executionTiming
            )} ${formatCurrencyAmount(
              getExecutionPrice(firstCandle, firstOrder.executionTiming),
              selectedInstrument.currency,
              false
            )}で${dueOrders.length}件約定しました`
          : `${dueOrders.length}件約定しました`,
        firstOrder.executeDate
      );
      playEffect("trade");
    };

    return () => {
      processPendingOrderRef.current = null;
    };
  }, [
    currentBook.longPositions,
    currentBook.pendingOrders,
    currentBook.shortPositions,
    playEffect,
    selectedDataPath,
    selectedInstrument.currency,
    selectedInstrument.multiplier,
    showOrderMessage,
  ]);

  useEffect(() => {
    const chartContainer = chartContainerRef.current;
    if (!chartContainer) return;

    let isDisposed = false;
    let removeKeyDown: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    setIsChartLoading(true);

    const chart = createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: chartContainer.clientHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: getChartBackgroundColor(appearanceSettings.theme),
        },
        textColor: getChartTextColor(appearanceSettings.theme),
      },
      grid: {
        vertLines: { color: getGridLineColor(appearanceSettings) },
        horzLines: { color: getGridLineColor(appearanceSettings) },
      },
      timeScale: {
        borderColor: getChartBorderColor(appearanceSettings.theme),
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: BAR_SPACING,
      },
      handleScale: {
        mouseWheel: false,
      },
      rightPriceScale: {
        borderColor: getChartBorderColor(appearanceSettings.theme),
        scaleMargins: {
          top: 0.06,
          bottom: 0.06,
        },
      },
    });
    chartApiRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: appearanceSettings.bullishColor,
      downColor: appearanceSettings.bearishColor,
      borderUpColor: appearanceSettings.bullishColor,
      borderDownColor: appearanceSettings.bearishColor,
      wickUpColor: appearanceSettings.bullishColor,
      wickDownColor: appearanceSettings.bearishColor,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "price",
        precision: selectedInstrument.priceDecimals,
        minMove: getMinMove(selectedInstrument.priceDecimals),
      },
    });

    const paintMarkerApi = createSeriesMarkers(candleSeries, []);

    const activeMaSettings = maDisplaySettings.filter(
      (setting) => setting.enabled && setting.period >= 1
    );
    const maSeriesList = activeMaSettings.map((setting) => {
      return {
        ...setting,
        series: chart.addSeries(LineSeries, {
          color: hexToRgba(setting.color, setting.opacity),
          lineWidth: toLineWidth(setting.width),
          lineStyle: toLineStyle(setting.style),
          priceLineVisible: false,
          lastValueVisible: false,
        }),
      };
    });

    const loadDailyCandles = async () => {
      const cachedCandles = dailyCandlesCacheRef.current.get(selectedDataPath);
      if (cachedCandles) return cachedCandles;

      const response = await fetch(selectedDataPath);
      if (!response.ok) {
        throw new Error(`CSV load failed: ${response.status}`);
      }

      const csvText = await response.text();
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      const candles = (result.data as CsvCandleRow[])
        .map((row) => ({
          time: row.Date?.substring(0, 10),
          open: Number(row.Open),
          high: Number(row.High),
          low: Number(row.Low),
          close: Number(row.Close),
        }))
        .filter(
          (x): x is Candle =>
            Boolean(x.time) &&
            !Number.isNaN(x.open) &&
            !Number.isNaN(x.high) &&
            !Number.isNaN(x.low) &&
            !Number.isNaN(x.close)
        );

      dailyCandlesCacheRef.current.set(selectedDataPath, candles);
      return candles;
    };

    loadDailyCandles()
      .then((dailyCandles) => {
        if (isDisposed) return;

        setSelectedDailyCandles(dailyCandles);
        if (!anchorDailyDateRef.current) {
          anchorDailyDateRef.current = pickInitialAnchorDate(
            dailyCandles,
            displayBars,
            viewSettings,
            chartViewStateRef.current.anchorDateByKey[
              getChartViewStateKey(selectedDataPath, timeframe)
            ]
          );
        }
        setTradingDates(new Set(dailyCandles.map((candle) => candle.time)));
        setCalendarRange({
          min: dailyCandles[0]?.time.slice(0, 7) ?? "",
          max: dailyCandles[dailyCandles.length - 1]?.time.slice(0, 7) ?? "",
        });
        setDateInputValue(anchorDailyDateRef.current);
        setCalendarMonth(anchorDailyDateRef.current.slice(0, 7));

        const allCandles = aggregateCandles(dailyCandles, timeframe);
        const candleIndexByTime = new Map(
          allCandles.map((candle, index) => [candle.time, index])
        );

        const allMAData = activeMaSettings.map((setting) => ({
          id: setting.id,
          period: setting.period,
          data: calculateMA(allCandles, setting.period)
            .map((item) => ({
              ...item,
              index: candleIndexByTime.get(item.time) ?? -1,
            }))
            .filter((item) => item.index >= 0),
        }));

        let endIndex = findEndIndexByAnchor(
          allCandles,
          anchorDailyDateRef.current ?? "",
          displayBars
        );
        let isClampingVisibleRange = false;

        const updateChart = () => {
          if (isDisposed) return;

          const startIndex = Math.max(0, endIndex - displayBars);
          const availableCandles = allCandles.slice(0, endIndex);
          candleSeries.setData(availableCandles);

          const displayDateByPaintDate = new Map<string, string>();
          currentPaintMarks.forEach((mark) => {
            const candleForMark = allCandles.find(
              (candle) =>
                mark.date >= candle.sourceStartTime &&
                mark.date <= candle.sourceEndTime
            );
            if (candleForMark) {
              displayDateByPaintDate.set(mark.date, candleForMark.time);
            }
          });
          const visibleTimes = new Set(availableCandles.map((candle) => candle.time));
          const visiblePaintMarkers: SeriesMarker<Time>[] = currentPaintMarks
            .map((mark) => ({
              mark,
              displayDate: displayDateByPaintDate.get(mark.date) ?? mark.date,
            }))
            .filter(({ displayDate }) => visibleTimes.has(displayDate))
            .map(
              ({ mark, displayDate }): SeriesMarker<Time> => ({
                time: displayDate,
                position: mark.type === "up" ? "belowBar" : "aboveBar",
                color:
                  mark.type === "up"
                    ? "#22c55e"
                    : mark.type === "down"
                      ? "#ef4444"
                      : "#f59e0b",
                shape:
                  mark.type === "up"
                    ? "arrowUp"
                    : mark.type === "down"
                      ? "arrowDown"
                      : "circle",
                text: getPaintMarkDisplayText(mark),
              })
            );
          paintMarkerApi.setMarkers(visiblePaintMarkers);

          maSeriesList.forEach((ma) => {
            const maData =
              allMAData.find((x) => x.id === ma.id)?.data ?? [];

            const availableMA = maData
              .filter((item) => item.index < endIndex)
              .map((item) => ({
                time: item.time,
                value: item.value,
              }));

            ma.series.setData(availableMA);
          });

          const nextVisibleRange = {
            from: startIndex,
            to: endIndex - 1,
          };
          const preservedVisibleRange =
            preserveVisibleRangeTransitionRef.current
              ? paintPracticeChartRangeRef.current
              : null;
          const visibleRangeToApply = preservedVisibleRange ?? nextVisibleRange;
          visibleLogicalRangeRef.current = visibleRangeToApply;
          ignoreNextRangeSyncRef.current = true;
          chart.timeScale().setVisibleLogicalRange(visibleRangeToApply);

          const latest = allCandles[endIndex - 1];
          setCanNavigateForward(endIndex < allCandles.length);
          setCurrentDate(formatDateWithWeekday(latest?.time ?? ""));
          setCurrentOhlc(latest ?? null);
          const anchorDate = anchorDailyDateRef.current ?? latest?.sourceEndTime ?? "";
          processPendingOrderRef.current?.(
            latest?.sourceEndTime ?? anchorDate,
            dailyCandles
          );
          setDateInputValue(anchorDate);
          const selectedDate = selectedChartDateRef.current;
          if (selectedDate) {
            const firstVisibleCandle = allCandles[startIndex];
            const lastVisibleCandle = allCandles[endIndex - 1];
            const firstVisibleDate =
              firstVisibleCandle?.sourceStartTime ?? firstVisibleCandle?.time;
            const lastVisibleDate =
              lastVisibleCandle?.sourceEndTime ?? lastVisibleCandle?.time;
            let nextSelectedDate = selectedDate;

            if (firstVisibleDate && selectedDate < firstVisibleDate) {
              nextSelectedDate = firstVisibleDate;
            } else if (lastVisibleDate && selectedDate > lastVisibleDate) {
              nextSelectedDate = lastVisibleDate;
            }

            if (nextSelectedDate !== selectedDate) {
              selectedChartDateRef.current = nextSelectedDate;
              setSelectedChartDate(nextSelectedDate);
            }
          }
          if (anchorDate) {
            setCalendarMonth(anchorDate.slice(0, 7));
          }
          if (anchorDate) {
            const viewStateKey = getChartViewStateKey(selectedDataPath, timeframe);
            setChartViewState((state) => ({
              displayBarsByKey: {
                ...state.displayBarsByKey,
                [viewStateKey]: Math.max(1, endIndex - startIndex),
              },
              anchorDateByKey: {
                ...state.anchorDateByKey,
                [viewStateKey]: anchorDate,
              },
            }));
          }
          window.requestAnimationFrame(() => {
            if (!isDisposed) {
              setIsChartLoading(false);
            }
          });
        };

        const syncVisibleRightEdge = (range: VisibleLogicalRange | null) => {
          if (!range) return;

          const rightIndex = Math.min(
            endIndex - 1,
            Math.max(0, Math.floor(range.to))
          );
          const rightEdgeCandle = allCandles[rightIndex];
          if (!rightEdgeCandle) return;

          const anchorDate =
            rightEdgeCandle.sourceEndTime ?? rightEdgeCandle.time;
          anchorDailyDateRef.current = anchorDate;
          setCurrentDate(formatDateWithWeekday(rightEdgeCandle.time ?? ""));
          setCurrentOhlc(rightEdgeCandle);
          setDateInputValue(anchorDate);
          if (anchorDate) {
            setCalendarMonth(anchorDate.slice(0, 7));
          }
          if (anchorDate) {
            const viewStateKey = getChartViewStateKey(selectedDataPath, timeframe);
            setChartViewState((state) => ({
              ...state,
              anchorDateByKey: {
                ...state.anchorDateByKey,
                [viewStateKey]: anchorDate,
              },
            }));
          }
          setCanNavigateForward(rightIndex < allCandles.length - 1);
          processPendingOrderRef.current?.(anchorDate, dailyCandles);
        };

        const syncSelectedDateIntoVisibleRange = (
          range: VisibleLogicalRange | null
        ) => {
          const selectedDate = selectedChartDateRef.current;
          if (!range || !selectedDate) return;

          const firstIndex = Math.max(0, Math.ceil(range.from));
          const lastIndex = Math.min(
            endIndex - 1,
            Math.max(0, Math.floor(range.to))
          );
          const firstVisibleCandle = allCandles[firstIndex];
          const lastVisibleCandle = allCandles[lastIndex];
          if (!firstVisibleCandle || !lastVisibleCandle) return;

          const firstVisibleDate =
            firstVisibleCandle.sourceStartTime ?? firstVisibleCandle.time;
          const lastVisibleDate =
            lastVisibleCandle.sourceEndTime ?? lastVisibleCandle.time;
          let nextSelectedDate = selectedDate;

          if (selectedDate < firstVisibleDate) {
            nextSelectedDate = firstVisibleDate;
          } else if (selectedDate > lastVisibleDate) {
            nextSelectedDate = lastVisibleDate;
          }

          if (nextSelectedDate !== selectedDate) {
            selectedChartDateRef.current = nextSelectedDate;
            setSelectedChartDate(nextSelectedDate);
          }
        };

        const updateVisibleBarsCount = (
          range: VisibleLogicalRange | null
        ) => {
          if (!range) return;

          const dataStartIndex = 0;
          const dataEndIndex = Math.max(0, endIndex - 1);
          const rangeWidth = Math.max(1, range.to - range.from);
          const maxFrom = Math.max(dataStartIndex, dataEndIndex - rangeWidth);
          let nextFrom = range.from;
          let nextTo = range.to;

          if (range.from < dataStartIndex) {
            nextFrom = dataStartIndex;
            nextTo = dataStartIndex + rangeWidth;
          }

          if (nextTo > dataEndIndex) {
            nextTo = dataEndIndex;
            nextFrom = Math.max(dataStartIndex, dataEndIndex - rangeWidth);
          }

          if (nextFrom > maxFrom) {
            nextFrom = maxFrom;
            nextTo = Math.min(dataEndIndex, maxFrom + rangeWidth);
          }

          const clampedRange = { from: nextFrom, to: nextTo };
          const shouldClamp =
            Math.abs(clampedRange.from - range.from) > 0.01 ||
            Math.abs(clampedRange.to - range.to) > 0.01;

          if (shouldClamp && !isClampingVisibleRange) {
            isClampingVisibleRange = true;
            chart.timeScale().setVisibleLogicalRange(clampedRange);
            visibleLogicalRangeRef.current = clampedRange;
            window.requestAnimationFrame(() => {
              isClampingVisibleRange = false;
            });
            return;
          }

          const shouldIgnoreRangeSync = ignoreNextRangeSyncRef.current;
          const isTimeframeSwitchSync = timeframeSwitchSyncRef.current;
          ignoreNextRangeSyncRef.current = false;

          rememberVisibleLogicalRange(clampedRange);
          syncVisibleRightEdge(clampedRange);
          syncSelectedDateIntoVisibleRange(clampedRange);
          if (
            !shouldIgnoreRangeSync &&
            !isTimeframeSwitchSync &&
            timeframe !== "daily"
          ) {
            upperTimeframeMovedRef.current = true;
            returnDailyDateRef.current = anchorDailyDateRef.current;
          }

          const firstIndex = Math.max(0, Math.ceil(clampedRange.from));
          const lastIndex = Math.min(
            endIndex - 1,
            Math.floor(clampedRange.to)
          );
          const count = Math.max(0, lastIndex - firstIndex + 1);
          setVisibleBarsCount((current) => (current === count ? current : count));
          if (count > 0) {
            const viewStateKey = getChartViewStateKey(selectedDataPath, timeframe);
            setChartViewState((state) => ({
              ...state,
              displayBarsByKey: {
                ...state.displayBarsByKey,
                [viewStateKey]: count,
              },
            }));
          }
        };
        chart
          .timeScale()
          .subscribeVisibleLogicalRangeChange(updateVisibleBarsCount);

        const moveBars = (step: number) => {
          const minIndex = Math.min(displayBars, allCandles.length);
          const anchorEndIndex = findEndIndexByAnchor(
            allCandles,
            anchorDailyDateRef.current ?? "",
            displayBars
          );
          const baseIndex = anchorEndIndex || endIndex;
          const nextIndex = Math.min(
            allCandles.length,
            Math.max(minIndex, baseIndex + step)
          );

          if (nextIndex === endIndex && baseIndex === endIndex) return;

          endIndex = nextIndex;
          anchorDailyDateRef.current = allCandles[endIndex - 1]?.sourceEndTime;
          if (timeframe !== "daily") {
            upperTimeframeMovedRef.current = true;
            returnDailyDateRef.current = anchorDailyDateRef.current;
          }
          updateChart();
        };

        navigateRef.current = moveBars;
        jumpToDateRef.current = (date) => {
          const dailyDate = findDailyDateOnOrBefore(dailyCandles, date);
          if (!dailyDate) return;

          setIsChartLoading(true);
          anchorDailyDateRef.current = dailyDate;
          if (timeframe !== "daily") {
            upperTimeframeMovedRef.current = true;
            returnDailyDateRef.current = dailyDate;
          }
          endIndex = findEndIndexByAnchor(allCandles, dailyDate, displayBars);
          updateChart();
        };

        const handleChartClick = (param: { time?: Time }) => {
          const clickedDate = chartTimeToDateText(param.time);
          if (!clickedDate) return;

          selectedChartDateRef.current = clickedDate;
          setSelectedChartDate(clickedDate);
        };
        chart.subscribeClick(handleChartClick);

        const moveSelectedDateToRight = () => {
          const selectedDate = selectedChartDateRef.current;
          if (!selectedDate) return;

          jumpToDateRef.current?.(selectedDate);
        };
        const handleChartDoubleClick = () => {
          moveSelectedDateToRight();
        };
        chartContainer.addEventListener("dblclick", handleChartDoubleClick);
        updateChart();

        const handleKeyDown = (event: KeyboardEvent) => {
          const target = event.target as HTMLElement | null;
          const isFormControl =
            target?.tagName === "INPUT" ||
            target?.tagName === "SELECT" ||
            target?.tagName === "TEXTAREA";

          if (event.key === "Enter" && !isFormControl) {
            moveSelectedDateToRight();
          }

          if (event.key === "ArrowLeft") {
            moveBars(-1);
          }

          if (event.key === "ArrowRight") {
            moveBars(1);
          }
        };

        window.addEventListener("keydown", handleKeyDown);
        removeKeyDown = () => {
          window.removeEventListener("keydown", handleKeyDown);
          chart.unsubscribeClick(handleChartClick);
          chart
            .timeScale()
            .unsubscribeVisibleLogicalRangeChange(updateVisibleBarsCount);
          chartContainer.removeEventListener(
            "dblclick",
            handleChartDoubleClick
          );
        };
      })
      .catch((error) => {
        console.error(error);
        if (!isDisposed) {
          setCurrentDate("読み込み失敗");
          setIsChartLoading(false);
        }
      });

    const handleResize = () => {
      const width = chartContainer.clientWidth;
      const height = chartContainer.clientHeight;

      if (
        Math.abs(width - lastChartWidthRef.current) > 2 &&
        !preserveVisibleRangeTransitionRef.current
      ) {
        lastChartWidthRef.current = width;

        setAutoDisplayBars((current) => {
          const nextAutoDisplayBars = calculateAutoDisplayBars(width);

          return current === nextAutoDisplayBars ? current : nextAutoDisplayBars;
        });
      }

      chart.applyOptions({
        width,
        height,
      });
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const horizontalDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey
          ? event.shiftKey
            ? event.deltaX || event.deltaY
            : event.deltaX
          : 0;

      if (horizontalDelta !== 0) {
        wheelNavigationAccumulatorRef.current += horizontalDelta;

        const steps = Math.trunc(
          wheelNavigationAccumulatorRef.current / WHEEL_NAVIGATION_THRESHOLD
        );

        if (steps !== 0) {
          wheelNavigationAccumulatorRef.current -=
            steps * WHEEL_NAVIGATION_THRESHOLD;
          navigateRef.current?.(steps);
        }

        return;
      }

      if (viewSettings.displayBarsMode === "fixed") return;

      const direction = event.deltaY > 0 ? 1 : -1;
      setIsChartLoading(true);
      setAutoDisplayBars((current) => {
        const step = Math.max(3, Math.round(current * 0.12));
        const next = current + direction * step;

        return Math.max(
          MIN_AUTO_DISPLAY_BARS,
          Math.min(MAX_AUTO_DISPLAY_BARS, next)
        );
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    chartContainer.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainer);

    return () => {
      isDisposed = true;
      navigateRef.current = null;
      jumpToDateRef.current = null;
      removeKeyDown?.();
      window.removeEventListener("resize", handleResize);
      chartContainer.removeEventListener("wheel", handleWheel, {
        capture: true,
      });
      resizeObserver?.disconnect();
      if (chartApiRef.current === chart) {
        chartApiRef.current = null;
      }
      chart.remove();
    };
  }, [
    selectedDataPath,
    timeframe,
    displayBars,
    viewSettings,
    maDisplaySettings,
    appearanceSettings,
    currentPaintMarks,
    rememberVisibleLogicalRange,
    selectedInstrument.priceDecimals,
  ]);

  const currentShortLots = currentBook.shortPositions.length;
  const currentLongLots = currentBook.longPositions.length;
  const realizedProfit = currentBook.logs.reduce(
    (total, log) => total + (log.realizedProfit ?? 0),
    0
  );
  const currentClose = currentOhlc?.close ?? null;
  const unrealizedProfit =
    currentClose === null
      ? 0
      : currentBook.shortPositions.reduce(
          (total, position) =>
            total +
            (position.entryPrice - currentClose) *
              position.sharesPerLot *
              selectedInstrument.multiplier,
          0
        ) +
        currentBook.longPositions.reduce(
          (total, position) =>
            total +
            (currentClose - position.entryPrice) *
              position.sharesPerLot *
              selectedInstrument.multiplier,
          0
        );
  const totalProfit = realizedProfit + unrealizedProfit;
  const instrumentUnitSummary = `1玉 = ${formatQuantity(
    sharesPerLot,
    selectedInstrument.unitLabel
  )} / ${selectedInstrument.currency}`;
  const instrumentMultiplierSummary =
    selectedInstrument.multiplier === 1
      ? ""
      : ` / multiplier ${selectedInstrument.multiplier}`;
  const pendingOrders = currentBook.pendingOrders;
  const pendingCloseShortLots = pendingOrders
    .filter((order) => order.action === "close-short")
    .reduce((total, order) => total + order.lots, 0);
  const pendingCloseLongLots = pendingOrders
    .filter((order) => order.action === "close-long")
    .reduce((total, order) => total + order.lots, 0);
  const orderActionLabel: Record<OrderAction, string> = {
    "add-short": isEnglish ? "Add Short" : "売りを追加",
    "close-short": isEnglish ? "Close Short" : "売りを返済",
    "add-long": isEnglish ? "Add Long" : "買いを追加",
    "close-long": isEnglish ? "Close Long" : "買いを返済",
  };
  const quickOrderLabel: Record<OrderAction, string> = {
    "add-short": isEnglish ? "Short +" : "売り +",
    "close-short": isEnglish ? "Short -" : "売り -",
    "add-long": isEnglish ? "Long +" : "買い +",
    "close-long": isEnglish ? "Long -" : "買い -",
  };
  const getCloseOrderAvailable = (action: OrderAction) =>
    action === "close-short"
      ? Math.max(0, currentShortLots - pendingCloseShortLots)
      : action === "close-long"
        ? Math.max(0, currentLongLots - pendingCloseLongLots)
        : Number.POSITIVE_INFINITY;
  const canPlaceOrderAction = (action: OrderAction) =>
    Boolean(dateInputValue) &&
    selectedDailyCandles.length > 0 &&
    orderLots <= getCloseOrderAvailable(action);
  const profitClassName = (value: number) =>
    value > 0
      ? "profit-positive"
      : value < 0
        ? "profit-negative"
        : "profit-neutral";
  const getTradeOutcome = (log: TradeLog): TradeOutcome | null => {
    if (log.realizedProfit === null) return null;
    if (log.realizedProfit === 0) return "draw";

    const closedValue =
      log.closedPositions?.reduce(
        (total, position) =>
          total +
          Math.abs(
            position.entryPrice *
              position.sharesPerLot *
              selectedInstrument.multiplier
          ),
        0
      ) ?? 0;
    const fallbackValue = Math.abs(
      log.executionPrice * log.shares * selectedInstrument.multiplier
    );
    const baseValue = closedValue > 0 ? closedValue : fallbackValue;

    if (baseValue > 0) {
      const profitRate = Math.abs(log.realizedProfit) / baseValue;
      if (profitRate < tradingSettings.drawRateThreshold) return "draw";
    }

    return log.realizedProfit > 0 ? "win" : "loss";
  };
  const tradeOutcomeLabel: Record<TradeOutcome, string> = {
    win: ui.win,
    loss: ui.loss,
    draw: ui.draw,
  };
  const tradeOutcomeCounts = currentBook.logs.reduce(
    (counts, log) => {
      const outcome = getTradeOutcome(log);
      if (outcome) counts[outcome] += 1;
      return counts;
    },
    { win: 0, loss: 0, draw: 0 } as Record<TradeOutcome, number>
  );

  const placeOrder = (action: OrderAction = orderAction) => {
    if (!dateInputValue) return;

    const actionCloseOrderAvailable = getCloseOrderAvailable(action);
    if (orderLots > actionCloseOrderAvailable) {
      playEffect("error");
      showOrderMessage("保有している玉数を超えて返済することはできません");
      return;
    }

    const currentIndex = selectedDailyCandles.findIndex(
      (candle) => candle.time === dateInputValue
    );
    const currentCandle = selectedDailyCandles[currentIndex];
    const nextCandle = selectedDailyCandles[currentIndex + 1];
    const executionTiming = tradingSettings.executionTiming;
    const executionCandle =
      executionTiming === "same-close" ? currentCandle : nextCandle;

    if (currentIndex < 0 || !executionCandle) {
      playEffect("error");
      showOrderMessage(
        executionTiming === "same-close"
          ? isEnglish
            ? "Cannot order because the selected day has no close price"
            : "対象日の終値がないため注文できません"
          : isEnglish
            ? "Cannot order because there is no next trading day"
            : "次の取引日がないため注文できません"
      );
      return;
    }

    const closingPositions =
      action === "close-short"
        ? currentBook.shortPositions.slice(
            pendingCloseShortLots,
            pendingCloseShortLots + orderLots
          )
        : action === "close-long"
          ? currentBook.longPositions.slice(
              pendingCloseLongLots,
              pendingCloseLongLots + orderLots
            )
          : [];
    const orderShares =
      closingPositions.length > 0
        ? closingPositions.reduce(
            (total, position) => total + position.sharesPerLot,
            0
          )
        : orderLots * sharesPerLot;
    const newOrder: PendingOrder = {
      id: createId("order"),
      action,
      lots: orderLots,
      shares: orderShares,
      sharesPerLot,
      orderedDate: dateInputValue,
      executeDate: executionCandle.time,
      executionTiming,
    };

    setTradingBooks((books) => {
      const book = books[selectedDataPath] ?? createEmptyTradingBook();
      return {
        ...books,
        [selectedDataPath]: {
          ...book,
          pendingOrder: null,
          pendingOrders: [...book.pendingOrders, newOrder],
        },
      };
    });
    showOrderMessage(
      `${formatDateWithWeekday(executionCandle.time)}の${getExecutionTimingPriceLabel(
        executionTiming
      )}で約定予定です`
    );
    if (executionTiming === "same-close") {
      window.setTimeout(() => {
        processPendingOrderRef.current?.(dateInputValue, selectedDailyCandles);
      }, 0);
    }
  };

  const cancelPendingOrder = (orderId: string) => {
    setTradingBooks((books) => {
      const book = books[selectedDataPath] ?? createEmptyTradingBook();
      return {
        ...books,
        [selectedDataPath]: {
          ...book,
          pendingOrder: null,
          pendingOrders: book.pendingOrders.filter(
            (order) => order.id !== orderId
          ),
        },
      };
    });
    showOrderMessage("注文を取り消しました");
  };

  const resetTradingBook = () => {
    setTradingBooks((books) => ({
      ...books,
      [selectedDataPath]: createEmptyTradingBook(),
    }));
    showOrderMessage("この銘柄の売買練習をリセットしました");
    setIsTradeLogOpen(false);
  };

  const exportTradeLogCsv = () => {
    const stockInfo = getStockInfoFromPath(selectedDataPath);
    const rows = [
      [
        "銘柄コード",
        "銘柄名",
        "注文種別",
        "玉数",
        "数量",
        "注文日",
        "約定日",
        "約定価格",
        "確定損益",
      ],
      ...[...currentBook.logs].reverse().map((log) => [
        stockInfo.code,
        stockInfo.name,
        orderActionLabel[log.action],
        log.lots,
        log.shares,
        log.orderedDate,
        log.executionDate,
        log.executionPrice,
        log.realizedProfit,
      ]),
    ];
    const csvText = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
      .join("\n");
    const fileDate = formatDate(new Date());
    const fileName = `${stockInfo.code || "trade"}_${stockInfo.name || "log"}_${fileDate}.csv`;

    downloadTextFile(fileName, `\uFEFF${csvText}`, "text/csv;charset=utf-8");
    showOrderMessage(
      isEnglish ? "Trade log exported as CSV" : "売買ログをCSV出力しました"
    );
    playEffect("success");
  };

  const getRelatedTradeLogIds = (targetLog: TradeLog) => {
    const relatedIds = new Set<string>();
    const targetPositionIds = new Set(targetLog.positionIds ?? []);
    const targetClosedIds = new Set(targetLog.closesPositionIds ?? []);

    currentBook.logs.forEach((log) => {
      if (log.id === targetLog.id) return;

      const opensTargetClosedPosition = (log.positionIds ?? []).some((id) =>
        targetClosedIds.has(id)
      );
      const closesTargetPosition = (log.closesPositionIds ?? []).some((id) =>
        targetPositionIds.has(id)
      );

      if (opensTargetClosedPosition || closesTargetPosition) {
        relatedIds.add(log.id);
      }
    });

    return relatedIds;
  };

  const deleteTradeLog = (logId: string) => {
    const targetLog = currentBook.logs.find((log) => log.id === logId);
    if (!targetLog) return;

    const relatedIds = getRelatedTradeLogIds(targetLog);
    const isOpeningLog =
      targetLog.action === "add-short" || targetLog.action === "add-long";
    const confirmMessage =
      isOpeningLog && relatedIds.size > 0
        ? isEnglish
          ? "This opening log has linked closing logs. Delete them together?"
          : "この建てログに対応する返済ログも一緒に削除します。よろしいですか？"
        : isEnglish
          ? "Delete this trade log?"
          : "この売買ログを削除しますか？";

    if (!window.confirm(confirmMessage)) return;

    setTradingBooks((books) => {
      const book = books[selectedDataPath] ?? createEmptyTradingBook();
      const target = book.logs.find((log) => log.id === logId);
      if (!target) return books;

      const idsToRemove = new Set<string>([logId]);
      const targetIsOpening =
        target.action === "add-short" || target.action === "add-long";

      if (targetIsOpening) {
        const targetPositionIds = new Set(target.positionIds ?? []);
        book.logs.forEach((log) => {
          if (
            log.id !== target.id &&
            (log.closesPositionIds ?? []).some((id) => targetPositionIds.has(id))
          ) {
            idsToRemove.add(log.id);
          }
        });
      }

      const removePositionIds = new Set(target.positionIds ?? []);
      let shortPositions = book.shortPositions.filter(
        (position) => !removePositionIds.has(position.id)
      );
      let longPositions = book.longPositions.filter(
        (position) => !removePositionIds.has(position.id)
      );

      const targetPositionIds = new Set(target.positionIds ?? []);
      const positionsToRestore = book.logs
        .filter((log) => idsToRemove.has(log.id))
        .flatMap((log) => log.closedPositions ?? [])
        .filter((position) => !targetPositionIds.has(position.id));
      const restoredIds = new Set(
        positionsToRestore.map((position) => position.id)
      );
      const currentPositionIds = new Set([
        ...book.shortPositions.map((position) => position.id),
        ...book.longPositions.map((position) => position.id),
      ]);
      const restoredShortPositions = positionsToRestore.filter(
        (position) =>
          position.side === "short" && !currentPositionIds.has(position.id)
      );
      const restoredLongPositions = positionsToRestore.filter(
        (position) =>
          position.side === "long" && !currentPositionIds.has(position.id)
      );

      shortPositions = [
        ...restoredShortPositions,
        ...shortPositions.filter((position) => !restoredIds.has(position.id)),
      ];
      longPositions = [
        ...restoredLongPositions,
        ...longPositions.filter((position) => !restoredIds.has(position.id)),
      ];

      return {
        ...books,
        [selectedDataPath]: {
          ...book,
          shortPositions,
          longPositions,
          logs: book.logs.filter((log) => !idsToRemove.has(log.id)),
        },
      };
    });
    setActiveTradeLogId("");
    showOrderMessage(
      isEnglish ? "Trade log deleted" : "売買ログを削除しました"
    );
  };

  const resetDisplayedSettings = () => {
    setMaDisplaySettings(DEFAULT_MA_DISPLAY_SETTINGS);
    setAppearanceSettings(DEFAULT_CHART_APPEARANCE_DRAFT);
    setTradingSettings(DEFAULT_TRADING_SETTINGS_DRAFT);
    setViewSettings(DEFAULT_VIEW_SETTINGS_DRAFT);
    setDisplayBarsOption("auto");
  };

  const updateMaDisplaySetting = (
    id: string,
    patch: Partial<MaDisplaySetting>
  ) => {
    setMaDisplaySettings((settings) =>
      settings.map((setting) =>
        setting.id === id ? { ...setting, ...patch } : setting
      )
    );
  };

  const addMaDisplaySetting = () => {
    setMaDisplaySettings((settings) => {
      const usedPeriods = new Set(settings.map((setting) => setting.period));
      const presetPeriods = [5, 10, 20, 50, 75, 100, 150, 200];
      const nextPeriod =
        presetPeriods.find((period) => !usedPeriods.has(period)) ?? 25;
      const presetColors = [
        "#ef4444",
        "#22c55e",
        "#2563eb",
        "#a855f7",
        "#f59e0b",
        "#06b6d4",
        "#f97316",
      ];

      return [
        ...settings,
        {
          id: createId("ma-setting"),
          label: `${nextPeriod}日`,
          enabled: true,
          period: nextPeriod,
          color: presetColors[settings.length % presetColors.length],
          width: 2,
          style: "solid",
          opacity: 1,
        },
      ];
    });
  };

  const deleteMaDisplaySetting = (id: string) => {
    setMaDisplaySettings((settings) =>
      settings.filter((setting) => setting.id !== id)
    );
  };

  const updateAppearanceSetting = <K extends keyof ChartAppearanceDraft>(
    key: K,
    value: ChartAppearanceDraft[K]
  ) => {
    setAppearanceSettings((settings) => ({
      ...settings,
      [key]: value,
    }));
  };

  const addPaintMark = (type: PaintMarkType) => {
    if (!paintTargetDate) {
      showOrderMessage("チャートの日付を選択してからメモを追加してください");
      return;
    }

    let text = "";
    if (type === "memo") {
      const enteredText = window.prompt("メモ内容を入力してください", "");
      if (enteredText === null) return;
      text = enteredText.trim();
      if (!text) {
        showOrderMessage("メモ内容が空のため追加しませんでした");
        return;
      }
    }

    const mark: PaintMark = {
      id: createId("paint"),
      date: paintTargetDate,
      type,
      text,
      createdAt: new Date().toISOString(),
    };

    setPaintMarksByStock((marksByStock) => ({
      ...marksByStock,
      [selectedDataPath]: [mark, ...(marksByStock[selectedDataPath] ?? [])],
    }));
    showOrderMessage(
      `${formatDateWithWeekday(paintTargetDate)}に${paintMarkTypeLabels[type]}を記録しました`
    );
  };

  const deletePaintMark = (id: string) => {
    setPaintMarksByStock((marksByStock) => ({
      ...marksByStock,
      [selectedDataPath]: (marksByStock[selectedDataPath] ?? []).filter(
        (mark) => mark.id !== id
      ),
    }));
    showOrderMessage(isEnglish ? "Chart memo deleted" : "チャートメモを削除しました");
  };

  const clearCurrentStockPaintMarks = () => {
    setPaintMarksByStock((marksByStock) => ({
      ...marksByStock,
      [selectedDataPath]: [],
    }));
    showOrderMessage(
      isEnglish
        ? "All chart memos for this symbol were deleted"
        : "この銘柄のチャートメモをすべて削除しました"
    );
  };

  useEffect(() => {
    if (!isPaintCanvasActive || !paintBackgroundDataUrl) {
      return;
    }
    const canvas = paintCanvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      paintObjects.forEach((object) => drawPaintObject(context, object));
      if (paintDraftObject) {
        drawPaintObject(context, paintDraftObject);
      }
      setIsPaintCanvasReady(true);
    };
    image.onerror = () => {
      if (!cancelled) {
        setIsPaintCanvasReady(false);
        setPaintStatusMessage("ペイント画像の読み込みに失敗しました");
      }
    };
    image.src = paintBackgroundDataUrl;

    return () => {
      cancelled = true;
    };
  }, [
    isPaintCanvasActive,
    paintBackgroundDataUrl,
    paintDraftObject,
    paintObjects,
  ]);

  const captureChartForPaint = async () => {
    const chart = chartApiRef.current;
    if (!chart) {
      playEffect("error");
      setPaintStatusMessage("チャートを取得できませんでした");
      return;
    }

    setPaintStatusMessage("チャート画像を取得中...");
    const rangeBeforeCapture =
      getCurrentVisibleLogicalRange() ?? paintPracticeChartRangeRef.current;

    preserveVisibleRangeTransitionRef.current = true;
    setIsPaintCanvasActive(false);
    setIsPaintCanvasReady(false);
    setPaintTextEditor(null);
    setIsPaintCapturing(true);
    try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const chartForScreenshot = chartApiRef.current ?? chart;
    if (rangeBeforeCapture) {
      chartForScreenshot.timeScale().setVisibleLogicalRange(rangeBeforeCapture);
      visibleLogicalRangeRef.current = rangeBeforeCapture;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }

    const screenshot = chartForScreenshot.takeScreenshot(true, false);
    setPaintBackgroundDataUrl(screenshot.toDataURL("image/png"));
    setPaintObjects([]);
    setPaintUndoStack([]);
    setPaintRedoStack([]);
    setPaintDraftObject(null);
    setPaintCanvasZoom(1);
    setIsPaintCapturing(false);
    setIsPaintCanvasActive(true);
    window.setTimeout(() => {
      preserveVisibleRangeTransitionRef.current = false;
    }, 600);
    setPaintStatusMessage("現在のチャートを取り込みました");
    playEffect("camera");
    } catch (error) {
      console.error(error);
      playEffect("error");
      setPaintStatusMessage("チャート画像の取得に失敗しました。もう一度お試しください");
    } finally {
      setIsPaintCapturing(false);
      window.setTimeout(() => {
        preserveVisibleRangeTransitionRef.current = false;
      }, 600);
    }
  };

  const getPaintCanvasPoint = (
    event: React.PointerEvent<HTMLCanvasElement>
  ): PaintPoint => {
    const canvas = event.currentTarget;
    const rectangle = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rectangle.left) / rectangle.width) * canvas.width,
      y: ((event.clientY - rectangle.top) / rectangle.height) * canvas.height,
    };
  };

  const erasePaintObjectAt = (point: PaintPoint) => {
    const reverseIndex = [...paintObjects]
      .reverse()
      .findIndex((object) => isPointNearPaintObject(point, object));
    if (reverseIndex < 0) return;

    const index = paintObjects.length - 1 - reverseIndex;
    setPaintUndoStack((stack) => [...stack, paintObjects]);
    setPaintRedoStack([]);
    setPaintObjects(
      paintObjects.filter((_, objectIndex) => objectIndex !== index)
    );
  };

  const commitPaintText = () => {
    if (!paintTextEditor) return;
    const text = paintTextEditor.value.trim();
    if (text) {
      setPaintUndoStack((stack) => [...stack, paintObjects]);
      setPaintRedoStack([]);
      setPaintObjects([
        ...paintObjects,
        {
          id: createId("drawing"),
          type: "text",
          color: paintPracticeColor,
          width: paintPracticeWidth,
          points: [paintTextEditor.point],
          text,
        },
      ]);
    }
    setPaintTextEditor(null);
  };

  const applyPaintPracticeColor = (colorValue: string) => {
    const color = colorValue.toLowerCase();
    setPaintPracticeColor(color);
    if (paintPracticeTool !== "eraser") {
      setPaintToolColors((colors) => ({
        ...colors,
        [paintPracticeTool]: color,
      }));
    }
  };

  const changePaintPracticeTool = (tool: PaintPracticeTool) => {
    if (paintTextEditor) {
      commitPaintText();
    }

    setPaintToolColors((colors) => ({
      ...colors,
      ...(paintPracticeTool !== "eraser"
        ? { [paintPracticeTool]: paintPracticeColor }
        : {}),
    }));
    setPaintPracticeTool(tool);

    if (tool !== "eraser") {
      setPaintPracticeColor(paintToolColors[tool] ?? paintPracticeColor);
    }
  };

  const updateCustomPaintColor = (colorValue: string) => {
    const color = colorValue.toLowerCase();
    applyPaintPracticeColor(color);

    setPaintCustomColors((colors) => {
      const existingIndex = colors.indexOf(color);
      if (existingIndex >= 0) {
        customColorEditingIndexRef.current = existingIndex;
        return colors;
      }
      if (paintPracticeColors.includes(color)) {
        customColorEditingIndexRef.current = null;
        return colors;
      }

      const editingIndex = customColorEditingIndexRef.current;
      if (editingIndex !== null && colors[editingIndex]) {
        return colors.map((item, index) =>
          index === editingIndex ? color : item
        );
      }

      customColorEditingIndexRef.current = colors.length;
      return [...colors, color];
    });
  };

  const removeCustomPaintColor = (color: string) => {
    setPaintCustomColors((colors) => colors.filter((item) => item !== color));
    if (paintPracticeColor === color) {
      applyPaintPracticeColor(paintPracticeColors[0]);
    }
    customColorEditingIndexRef.current = null;
  };

  const changePaintCanvasZoom = (amount: number) => {
    setPaintCanvasZoom((zoom) =>
      Math.max(0.5, Math.min(2, Number((zoom + amount).toFixed(2))))
    );
  };

  const handlePaintPointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!paintBackgroundDataUrl || !isPaintCanvasReady) return;
    const point = getPaintCanvasPoint(event);

    if (paintPracticeTool === "eraser") {
      erasePaintObjectAt(point);
      return;
    }

    if (paintPracticeTool === "text") {
      event.preventDefault();
      const existingText = paintTextEditor?.value.trim();
      if (existingText) {
        commitPaintText();
      }
      const placeholderRectangle =
        event.currentTarget.parentElement?.getBoundingClientRect();
      if (!placeholderRectangle) return;
      const editorWidth = 310;
      const left = Math.min(
        Math.max(event.clientX - placeholderRectangle.left, 8),
        Math.max(8, placeholderRectangle.width - editorWidth - 8)
      );
      const top = Math.min(
        Math.max(event.clientY - placeholderRectangle.top, 8),
        Math.max(8, placeholderRectangle.height - 38)
      );
      setPaintTextEditor({
        point,
        left,
        top,
        value: "",
      });
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    paintPointerActiveRef.current = true;
    setPaintDraftObject({
      id: createId("drawing"),
      type: paintPracticeTool,
      color: paintPracticeColor,
      width: paintPracticeWidth,
      points: [point, point],
    });
  };

  const handlePaintPointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!paintPointerActiveRef.current) return;
    const point = getPaintCanvasPoint(event);

    setPaintDraftObject((object) => {
      if (!object) return null;
      if (object.type === "freehand") {
        return { ...object, points: [...object.points, point] };
      }

      return { ...object, points: [object.points[0], point] };
    });
  };

  const finishPaintDrawing = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!paintPointerActiveRef.current) return;
    paintPointerActiveRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const completedObject = paintDraftObject;
    setPaintDraftObject(null);
    if (!completedObject) return;
    setPaintUndoStack((stack) => [...stack, paintObjects]);
    setPaintRedoStack([]);
    setPaintObjects([...paintObjects, completedObject]);
  };

  const undoPaintDrawing = useCallback(() => {
    const previous = paintUndoStack[paintUndoStack.length - 1];
    if (!previous) return;
    setPaintUndoStack((stack) => stack.slice(0, -1));
    setPaintRedoStack((stack) => [...stack, paintObjects]);
    setPaintObjects(previous);
  }, [paintObjects, paintUndoStack]);

  const redoPaintDrawing = useCallback(() => {
    const next = paintRedoStack[paintRedoStack.length - 1];
    if (!next) return;
    setPaintRedoStack((stack) => stack.slice(0, -1));
    setPaintUndoStack((stack) => [...stack, paintObjects]);
    setPaintObjects(next);
  }, [paintObjects, paintRedoStack]);

  const clearPaintDrawing = () => {
    if (paintObjects.length === 0) return;
    setPaintUndoStack((stack) => [...stack, paintObjects]);
    setPaintRedoStack([]);
    setPaintObjects([]);
  };

  const createPaintOutputCanvas = () => {
    const source = paintCanvasRef.current;
    if (!source) return null;
    const noteHeight = paintPracticeNote.trim() ? 92 : 0;
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height + noteHeight;
    const context = output.getContext("2d");
    if (!context) return null;

    context.drawImage(source, 0, 0);
    if (noteHeight > 0) {
      context.fillStyle = "#0f172a";
      context.fillRect(0, source.height, output.width, noteHeight);
      context.fillStyle = "#f8fafc";
      context.font = '16px "Yu Gothic UI", sans-serif';
      context.fillText("メモ", 18, source.height + 26);
      context.fillStyle = "#cbd5e1";
      context.font = '14px "Yu Gothic UI", sans-serif';
      const note = paintPracticeNote.trim().slice(0, 160);
      context.fillText(note, 18, source.height + 56, output.width - 36);
    }

    return output;
  };

  const downloadPaintPng = () => {
    const output = createPaintOutputCanvas();
    if (!output) return;
    const stock = getStockInfoFromPath(selectedDataPath);
    const link = document.createElement("a");
    link.href = output.toDataURL("image/png");
    link.download = `${stock.code}_${stock.name}_${dateInputValue || "chart"}_paint.png`;
    link.click();
    setPaintStatusMessage("PNGをダウンロードしました");
    playEffect("success");
  };

  const saveCurrentPaintPractice = async () => {
    if (!paintBackgroundDataUrl) return;
    const stock = getStockInfoFromPath(selectedDataPath);
    const item: SavedPaintPractice = {
      id: createId("paint-practice"),
      stockPath: selectedDataPath,
      stockCode: stock.code,
      stockName: stock.name,
      targetDate: dateInputValue,
      createdAt: new Date().toISOString(),
      backgroundDataUrl: paintBackgroundDataUrl,
      objects: paintObjects,
      note: paintPracticeNote,
    };

    try {
      await savePaintPracticeToDatabase(item);
      setPaintStatusMessage("ペイント結果を保存しました");
      playEffect("success");
      setPaintSavedItems(await loadPaintPracticesFromDatabase());
    } catch (error) {
      console.error(error);
      playEffect("error");
      setPaintStatusMessage("ペイント結果の保存に失敗しました");
    }
  };

  const openPaintHistory = async () => {
    try {
      setPaintSavedItems(await loadPaintPracticesFromDatabase());
      setIsPaintHistoryOpen(true);
    } catch (error) {
      console.error(error);
      setPaintStatusMessage("保存履歴を読み込めませんでした");
    }
  };

  const loadSavedPaintPractice = (item: SavedPaintPractice) => {
    setIsPaintCanvasReady(false);
    setPaintCanvasZoom(1);
    setPaintBackgroundDataUrl(item.backgroundDataUrl);
    setPaintObjects(item.objects);
    setPaintUndoStack([]);
    setPaintRedoStack([]);
    setPaintPracticeNote(item.note);
    setIsPaintCanvasActive(true);
    setIsPaintHistoryOpen(false);
    setPaintStatusMessage("保存したペイントを読み込みました");
  };

  const deleteSavedPaintPractice = async (id: string) => {
    await deletePaintPracticeFromDatabase(id);
    setPaintSavedItems((items) => items.filter((item) => item.id !== id));
  };

  const openPaintPractice = useCallback(() => {
    const rangeBeforeOpen = getCurrentVisibleLogicalRange();
    paintPracticeChartRangeRef.current = rangeBeforeOpen;
    tradePanelBeforePaintRef.current = isTradePanelOpen;
    setIsTradePanelOpen(false);
    setIsPaintCanvasActive(false);
    setIsPaintCanvasReady(false);
    setIsPaintPracticeOpen(true);
    restoreVisibleLogicalRange(rangeBeforeOpen);
  }, [getCurrentVisibleLogicalRange, isTradePanelOpen, restoreVisibleLogicalRange]);

  const closePaintPractice = useCallback(() => {
    const rangeBeforeClose =
      getCurrentVisibleLogicalRange() ?? paintPracticeChartRangeRef.current;
    setIsPaintPracticeOpen(false);
    setIsPaintCanvasActive(false);
    setIsPaintCanvasReady(false);
    setPaintTextEditor(null);
    setIsTradePanelOpen(tradePanelBeforePaintRef.current);
    restoreVisibleLogicalRange(rangeBeforeClose);
  }, [getCurrentVisibleLogicalRange, restoreVisibleLogicalRange]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error(error);
      showOrderMessage(
        isEnglish
          ? "Could not toggle fullscreen"
          : "全画面表示を切り替えられませんでした"
      );
    }
  }, [isEnglish, showOrderMessage]);

  useEffect(() => {
    const isShortcutDisabledTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      return (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
    };

    const handleShortcutKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isEditableTarget = isShortcutDisabledTarget(event.target);

      if (
        isPaintPracticeOpen &&
        isPaintCanvasActive &&
        !isEditableTarget &&
        !event.altKey &&
        (event.ctrlKey || event.metaKey)
      ) {
        if (key === "z" && event.shiftKey) {
          event.preventDefault();
          redoPaintDrawing();
          return;
        }
        if (key === "z") {
          event.preventDefault();
          undoPaintDrawing();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          redoPaintDrawing();
          return;
        }
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget) return;

      if (key === "d" || key === "w" || key === "m") {
        event.preventDefault();
        const nextTimeframe: Timeframe =
          key === "d" ? "daily" : key === "w" ? "weekly" : "monthly";
        changeTimeframe(nextTimeframe);
        return;
      }

      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }

      if (key === "p") {
        event.preventDefault();
        if (isPaintPracticeOpen) {
          closePaintPractice();
        } else {
          openPaintPractice();
        }
        return;
      }

      if (event.key === "Escape") {
        if (
          isPaintHistoryOpen ||
          isAppearanceSettingsOpen ||
          isDatePickerOpen ||
          isPaintPracticeOpen
        ) {
          event.preventDefault();
          setIsPaintHistoryOpen(false);
          setIsAppearanceSettingsOpen(false);
          setIsDatePickerOpen(false);
          if (isPaintPracticeOpen) {
            closePaintPractice();
          }
        }
      }
    };

    window.addEventListener("keydown", handleShortcutKeyDown);

    return () => {
      window.removeEventListener("keydown", handleShortcutKeyDown);
    };
  }, [
    timeframe,
    isPaintPracticeOpen,
    isPaintCanvasActive,
    isPaintHistoryOpen,
    isAppearanceSettingsOpen,
    isDatePickerOpen,
    undoPaintDrawing,
    redoPaintDrawing,
    openPaintPractice,
    closePaintPractice,
    changeTimeframe,
    toggleFullscreen,
  ]);

  return (
    <div
      className={`trading-app ${
        isTradePanelOpen ? "" : "trade-panel-collapsed"
      } ${isPaintPracticeOpen ? "paint-practice-open" : ""} ${
        isPaintCanvasActive ? "paint-canvas-active" : ""
      } ${isPaintCapturing ? "paint-capture-preparing" : ""}`}
      style={{
        ...getAppThemeStyle(appearanceSettings.theme),
        backgroundColor: getAppBackgroundColor(appearanceSettings.theme),
        height: "100dvh",
        padding: "4px 8px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="mobile-portrait-notice" aria-hidden="true">
        <strong>横画面がおすすめです</strong>
        <span>
          端末を横向きにすると、チャートやペイント練習を広く使えます。
        </span>
      </div>

      <header
        className="chart-toolbar"
        style={{
          paddingLeft: isPaintPracticeOpen ? "280px" : 0,
          boxSizing: "border-box",
          transition: "padding-left 0.18s ease",
        }}
      >
        <div
          className="stock-selector-row"
          style={{
          display: "flex",
          alignItems: "center",
          justifyContent: isPaintPracticeOpen ? "flex-start" : "center",
          gap: "8px",
          margin: "2px 0 4px 0",
          color: "#cbd5e1",
          fontSize: "14px",
        }}
      >
        <label
          className="stock-select-label"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span className="visually-hidden">{ui.stock}</span>
          <select
            className="stock-select"
            aria-label={ui.stock}
            value={selectedDataPath}
            onChange={(event) => {
              const nextDataPath = event.target.value;
              anchorDailyDateRef.current = null;
              returnDailyDateRef.current = null;
              upperTimeframeMovedRef.current = false;
              ignoreNextRangeSyncRef.current = false;
              timeframeSwitchSyncRef.current = false;
              setCurrentDate("");
              setCurrentOhlc(null);
              setDateInputValue("");
              selectedChartDateRef.current = "";
              setSelectedChartDate("");
              setTradingDates(new Set());
              setSelectedDailyCandles([]);
              showOrderMessage("");
              setIsDatePickerOpen(false);
              setIsChartLoading(true);
              setSharesPerLot(
                getInstrumentDefinition(nextDataPath).defaultLotSize
              );
              setSelectedDataPath(nextDataPath);
              event.currentTarget.blur();
            }}
            style={{
              backgroundColor: "var(--panel-muted)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          >
            {DATA_FILES.map((path) => {
              const info = getStockInfoFromPath(path);

              return (
                <option key={path} value={path}>
                  {info.code} {info.name}
                </option>
              );
            })}
          </select>
        </label>
        </div>

        <div
          className="timeframe-row"
          style={{
          display: "flex",
          alignItems: "center",
          justifyContent: isPaintPracticeOpen ? "flex-start" : "center",
          gap: "8px",
          margin: "2px 0 4px 0",
          flexWrap: "wrap",
        }}
      >
        <div className="toolbar-group timeframe-group">
          <span className="toolbar-group-label">{ui.timeframe}</span>
          <div className="segmented-control">
            {(["daily", "weekly", "monthly"] as Timeframe[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (timeframe === value) return;
                  changeTimeframe(value);
                }}
                className={timeframe === value ? "is-active" : ""}
              >
                {value === "daily"
                  ? ui.daily
                  : value === "weekly"
                    ? ui.weekly
                    : ui.monthly}
              </button>
            ))}
          </div>
        </div>

        <label
          className="toolbar-group display-bars-group"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--text)",
            fontSize: "14px",
          }}
        >
          <span className="toolbar-group-label">{ui.display}</span>
          <select
            className="display-bars-select"
            value={displayBarsOption}
            onChange={(event) => {
              const nextValue = event.target.value as DisplayBarsOption;
              setIsChartLoading(true);
              setDisplayBarsOption(nextValue);
              setViewSettings((settings) => {
                if (nextValue === "auto") {
                  return { ...settings, displayBarsMode: "auto" };
                }
                if (nextValue === "remember") {
                  return { ...settings, displayBarsMode: "remember" };
                }

                return {
                  ...settings,
                  displayBarsMode: "fixed",
                  fixedDisplayBars: Number(nextValue),
                };
              });
              event.currentTarget.blur();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                navigateRef.current?.(-1);
              }

              if (event.key === "ArrowRight") {
                event.preventDefault();
                navigateRef.current?.(1);
              }
            }}
            style={{
              backgroundColor: "var(--panel-muted)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          >
            {displayBarsOptions.map((option) => (
              <option key={option.value} value={option.value}>
                  {option.value === "auto"
                    ? ui.autoBars
                    : option.value === "remember"
                      ? isEnglish
                        ? "Last"
                        : "前回"
                      : `${option.value}${ui.barsSuffix}`}
              </option>
            ))}
          </select>
          <span className="visible-bars-count">
            {ui.visibleBars} {visibleBarsCount || displayBars}{ui.barsSuffix}
          </span>
        </label>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title={isEnglish ? "You can also press F" : "Fキーでも切り替えできます"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: isFullscreen
              ? "var(--control-active-bg)"
              : "var(--panel-muted)",
            border: isFullscreen
              ? "1px solid var(--blue)"
              : "1px solid var(--border-strong)",
            color: isFullscreen ? "#fff" : "var(--text)",
            padding: "5px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          ⛶ {isFullscreen ? ui.exitFullscreen : ui.fullscreen}
        </button>

        <button
          type="button"
          onClick={() => setSoundEnabled((enabled) => !enabled)}
          title={isEnglish ? "Toggle sound effects" : "効果音のオン・オフを切り替えます"}
          aria-label={isEnglish ? "Toggle sound effects" : "効果音のオン・オフ"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: soundEnabled
              ? "var(--panel-muted)"
              : "var(--control-bg)",
            border: soundEnabled
              ? "1px solid var(--border-strong)"
              : "1px solid var(--border)",
            color: soundEnabled ? "var(--text)" : "var(--muted)",
            padding: "5px 10px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {soundEnabled ? `🔊 ${ui.soundOn}` : `🔇 ${ui.muted}`}
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsTab("appearance");
            setIsAppearanceSettingsOpen(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: isAppearanceSettingsOpen
              ? "var(--control-active-bg)"
              : "var(--panel-muted)",
            border: isAppearanceSettingsOpen
              ? "1px solid var(--blue)"
              : "1px solid var(--border-strong)",
            color: isAppearanceSettingsOpen ? "#fff" : "var(--text)",
            padding: "5px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          ⚙ {ui.settings}
        </button>

        </div>

        <div
          className="navigation-row"
          style={{
          display: "flex",
          alignItems: "center",
          justifyContent: isPaintPracticeOpen ? "flex-start" : "center",
          gap: "12px",
          margin: "0 0 4px 0",
          color: "#e5e7eb",
          flexWrap: "wrap",
        }}
      >
        <button
          className="bar-navigation-button"
          type="button"
          onClick={() => navigateRef.current?.(-1)}
          aria-label={ui.backOneBar}
          style={{
            backgroundColor: "var(--panel-muted)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
            padding: "5px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ← {ui.backOneBar}
        </button>

        <div style={{ position: "relative" }}>
          <button
            className="current-date-button"
            type="button"
            onClick={() => {
              if (!isDatePickerOpen && dateInputValue) {
                setCalendarMonth(dateInputValue.slice(0, 7));
              }

              setIsDatePickerOpen((value) => !value);
            }}
            style={{
              minWidth: "210px",
              padding: "5px 12px",
              border: "1px solid var(--border-strong)",
              borderRadius: "6px",
              backgroundColor: "var(--panel-muted)",
              color: "var(--text)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {ui.currentDate}: {currentDate || ui.loading}
          </button>

          {isDatePickerOpen && (
            <div
              style={{
                position: "absolute",
                top: "44px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                padding: "10px",
                border: "1px solid #475569",
                borderRadius: "6px",
                backgroundColor: "#111827",
                boxShadow: "0 12px 24px rgba(0, 0, 0, 0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((value) => shiftCalendarMonth(value, -1))
                  }
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "1px solid #475569",
                    borderRadius: "4px",
                    backgroundColor: "#1f2937",
                    color: "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  ←
                </button>

                <div
                  style={{
                    minWidth: "120px",
                  }}
                >
                  <input
                    type="month"
                    value={calendarMonth}
                    min={calendarRange.min}
                    max={calendarRange.max}
                    onChange={(event) => {
                      if (event.target.value) {
                        setCalendarMonth(event.target.value);
                      }
                    }}
                    style={{
                      width: "120px",
                      boxSizing: "border-box",
                      color: "#111827",
                      backgroundColor: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "4px",
                      padding: "5px 6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((value) => shiftCalendarMonth(value, 1))
                  }
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "1px solid #475569",
                    borderRadius: "4px",
                    backgroundColor: "#1f2937",
                    color: "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  →
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 34px)",
                  gap: "4px",
                  color: "#94a3b8",
                  fontSize: "12px",
                  marginBottom: "4px",
                }}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div key={day}>{day}</div>
                  )
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 34px)",
                  gap: "4px",
                }}
              >
                {getCalendarCells(calendarMonth).map((date, index) => {
                  const isSelected = date === dateInputValue;
                  const isEnabled = date ? tradingDates.has(date) : false;

                  return date ? (
                    <button
                      key={date}
                      type="button"
                      disabled={!isEnabled}
                      onClick={() => {
                        if (!isEnabled) return;
                        setDateInputValue(date);
                        setIsDatePickerOpen(false);
                        jumpToDateRef.current?.(date);
                      }}
                      style={{
                        width: "34px",
                        height: "32px",
                        border: isSelected
                          ? "1px solid #60a5fa"
                          : "1px solid #334155",
                        borderRadius: "4px",
                        backgroundColor: isSelected
                          ? "#2563eb"
                          : isEnabled
                            ? "#1f2937"
                            : "#0f172a",
                        color: isEnabled ? "#f8fafc" : "#475569",
                        cursor: isEnabled ? "pointer" : "not-allowed",
                        fontSize: "13px",
                        opacity: isEnabled ? 1 : 0.55,
                      }}
                    >
                      {Number(date.slice(8, 10))}
                    </button>
                  ) : (
                    <div key={`empty-${index}`} />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          className="bar-navigation-button"
          type="button"
          onClick={() => navigateRef.current?.(1)}
          aria-label={ui.forwardOneBar}
          disabled={!canNavigateForward}
          title={
            canNavigateForward
              ? isEnglish
                ? "Move to the next bar"
                : "次の足へ進みます"
              : isEnglish
                ? "Already at the latest available data"
                : "最新データのため、これ以上進めません"
          }
          style={{
            backgroundColor: "var(--panel-muted)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
            padding: "5px 12px",
            borderRadius: "6px",
            cursor: canNavigateForward ? "pointer" : "not-allowed",
            fontSize: "14px",
            opacity: canNavigateForward ? 1 : 0.45,
          }}
        >
          {ui.forwardOneBar} →
        </button>

        <button
          type="button"
          className="selected-date-button"
          disabled={!selectedChartDate}
          onClick={() => jumpToDateRef.current?.(selectedChartDate)}
          title={
            selectedChartDate
              ? isEnglish
                ? "Move the selected day to the right edge (Enter)"
                : "選択した日をチャート右端へ移動します（Enter）"
              : isEnglish
                ? "Click a candlestick on the chart"
                : "チャート上のローソク足をクリックしてください"
          }
        >
          {selectedChartDate
            ? `${ui.selected}: ${formatDateWithWeekday(selectedChartDate)} → ${
                isEnglish ? "Right edge" : "右端"
              }`
            : ui.selectCandle}
          {selectedChartDate && <kbd>Enter</kbd>}
        </button>

        <div
          className="ohlc-strip"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "5px 12px",
            border: "1px solid var(--border-strong)",
            borderRadius: "6px",
            backgroundColor: "var(--panel-muted)",
            color: "var(--text)",
            fontSize: "14px",
            whiteSpace: "nowrap",
          }}
        >
          <span>
            {ui.open}:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.open, selectedInstrument.priceDecimals)
              : "-"}
          </span>
          <span>
            {ui.high}:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.high, selectedInstrument.priceDecimals)
              : "-"}
          </span>
          <span>
            {ui.low}:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.low, selectedInstrument.priceDecimals)
              : "-"}
          </span>
          <span>
            {ui.closePrice}:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.close, selectedInstrument.priceDecimals)
              : "-"}
          </span>
        </div>
        </div>
      </header>

      <div
        className="chart-stage"
        style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}
      >
        <div
          ref={chartContainerRef}
          style={{
            width: "100%",
            height: "100%",
          }}
        />

        {isPaintPracticeOpen && isPaintCanvasActive && (
          <div className="paint-canvas-workspace">
            <div className="paint-canvas-toolbar">
              <div>
                <strong>{ui.paintCanvas}</strong>
                <span>
                  {getStockInfoFromPath(selectedDataPath).code}{" "}
                  {getStockInfoFromPath(selectedDataPath).name}・
                  {dateInputValue
                    ? formatDateWithWeekday(dateInputValue)
                    : isEnglish
                      ? "No date selected"
                      : "日付未選択"}
                </span>
              </div>
              <div className="paint-canvas-zoom">
                <button
                  type="button"
                  onClick={() => changePaintCanvasZoom(-0.25)}
                  disabled={paintCanvasZoom <= 0.5}
                  aria-label="縮小"
                >
                  −
                </button>
                <span>{Math.round(paintCanvasZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => changePaintCanvasZoom(0.25)}
                  disabled={paintCanvasZoom >= 2}
                  aria-label="拡大"
                >
                  ＋
                </button>
              </div>
            </div>

            <div
              className={`paint-canvas-placeholder ${
                paintCanvasZoom > 1 ? "is-zoomed" : ""
              }`}
            >
              <canvas
                ref={paintCanvasRef}
                className="paint-drawing-canvas"
                onPointerDown={handlePaintPointerDown}
                onPointerMove={handlePaintPointerMove}
                onPointerUp={finishPaintDrawing}
                onPointerCancel={finishPaintDrawing}
                style={{
                  cursor:
                    paintPracticeTool === "text"
                      ? "text"
                      : paintPracticeTool === "eraser"
                        ? "cell"
                        : "crosshair",
                  width: `${paintCanvasZoom * 100}%`,
                  maxWidth: paintCanvasZoom > 1 ? "none" : "100%",
                  maxHeight: paintCanvasZoom > 1 ? "none" : "100%",
                }}
              />
              {paintTextEditor && (
                <form
                  className="paint-inline-text-input"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitPaintText();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    left: `${paintTextEditor.left}px`,
                    top: `${paintTextEditor.top}px`,
                  }}
                >
                  <input
                    ref={paintTextInputRef}
                    type="text"
                    autoFocus
                    value={paintTextEditor.value}
                    onChange={(event) =>
                      setPaintTextEditor((editor) =>
                        editor
                          ? { ...editor, value: event.target.value }
                          : null
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setPaintTextEditor(null);
                      }
                    }}
                    placeholder="文字を入力"
                    style={{
                      color: paintPracticeColor,
                      fontSize: `${Math.max(
                        15,
                        getPaintTextFontSize(paintPracticeWidth) * 0.5
                      )}px`,
                    }}
                  />
                  <button type="submit" aria-label={ui.addText}>
                    {ui.addText}
                  </button>
                  <button
                    type="button"
                    aria-label={
                      isEnglish ? "Cancel text input" : "テキスト入力を取消"
                    }
                    onClick={() => setPaintTextEditor(null)}
                  >
                    ×
                  </button>
                </form>
              )}
            </div>

            <label className="paint-note-area">
              <span>{isEnglish ? "Memo (optional)" : "メモ（任意）"}</span>
              <textarea
                value={paintPracticeNote}
                onChange={(event) => setPaintPracticeNote(event.target.value)}
                placeholder={
                  isEnglish
                    ? "Record analysis notes or review points"
                    : "分析内容や振り返りを記録"
                }
              />
            </label>
          </div>
        )}

        {isChartLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              color: "#f8fafc",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                border: "4px solid rgba(248, 250, 252, 0.28)",
                borderTopColor: "#f8fafc",
                borderRadius: "50%",
                animation: "chart-spin 0.8s linear infinite",
              }}
            />
          </div>
        )}
      </div>

      <aside
        className="paint-practice-panel"
        aria-label={ui.paintPractice}
        aria-hidden={!isPaintPracticeOpen}
      >
        <div className="paint-panel-header">
          <div>
            <h2>{ui.paintPractice}</h2>
            <p>{ui.paintPracticeDescription}</p>
          </div>
          <button
            type="button"
            onClick={closePaintPractice}
            aria-label={isEnglish ? "Close paint practice" : "ペイント練習を閉じる"}
          >
            ×
          </button>
        </div>

        <div className="paint-panel-body">
          <div className="paint-workflow">
            <span>{isEnglish ? "Analyze live chart" : "ライブチャートで分析"}</span>
            <b>→</b>
            <span>{isEnglish ? "Capture" : "スクショ取得"}</span>
            <b>→</b>
            <span>{isEnglish ? "Draw and review" : "描画・振り返り"}</span>
          </div>

          <button
            type="button"
            className="capture-chart-button"
            onClick={captureChartForPaint}
            disabled={isPaintCapturing}
          >
            <span>▣</span>
            {isPaintCanvasActive
              ? ui.replaceChartImage
              : ui.captureChart}
          </button>
          <p className="capture-chart-help">
            {ui.captureHelp}
          </p>

          <section className="paint-control-section">
            <h3>{ui.drawingTools}</h3>
            <div className="paint-tool-grid">
              {paintPracticeTools.map((tool) => (
                <button
                  key={tool.value}
                  type="button"
                  className={
                    paintPracticeTool === tool.value ? "is-selected" : ""
                  }
                  onClick={() => changePaintPracticeTool(tool.value)}
                  disabled={!isPaintDrawingReady}
                >
                  {tool.value === "eraser" ? (
                    <span className="paint-eraser-icon" aria-hidden="true">
                      <i />
                    </span>
                  ) : (
                    <span>{tool.icon}</span>
                  )}
                  {paintPracticeToolLabels[tool.value]}
                </button>
              ))}
            </div>
          </section>

          <section className="paint-control-section">
            <h3>{ui.color}</h3>
            <div className="paint-color-row">
              {paintPracticeColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={
                    paintPracticeColor === color ? "is-selected" : ""
                  }
                  style={{ backgroundColor: color }}
                  onClick={() => applyPaintPracticeColor(color)}
                  disabled={!isPaintDrawingReady}
                  aria-label={
                    isEnglish ? `Drawing color ${color}` : `描画色 ${color}`
                  }
                />
              ))}
              {paintCustomColors.map((color) => (
                <span className="paint-custom-swatch" key={color}>
                  <button
                    type="button"
                    className={
                      paintPracticeColor === color ? "is-selected" : ""
                    }
                    style={{ backgroundColor: color }}
                    onClick={() => applyPaintPracticeColor(color)}
                    disabled={!isPaintDrawingReady}
                    aria-label={
                      isEnglish
                        ? `Custom drawing color ${color}`
                        : `カスタム描画色 ${color}`
                    }
                  />
                  <button
                    type="button"
                    className="paint-custom-swatch-remove"
                    onClick={() => removeCustomPaintColor(color)}
                    aria-label={
                      isEnglish
                        ? `Remove custom drawing color ${color}`
                        : `カスタム描画色 ${color}を削除`
                    }
                    title={isEnglish ? "Remove this color" : "この色を削除"}
                  >
                    ×
                  </button>
                </span>
              ))}
              <label className="paint-custom-color">
                ＋
                <input
                  type="color"
                  value={paintPracticeColor}
                  onPointerDown={() => {
                    customColorEditingIndexRef.current = null;
                  }}
                  onChange={(event) =>
                    updateCustomPaintColor(event.target.value)
                  }
                  onBlur={() => {
                    customColorEditingIndexRef.current = null;
                  }}
                  disabled={!isPaintDrawingReady}
                  aria-label={
                    isEnglish ? "Custom drawing color" : "カスタム描画色"
                  }
                />
              </label>
            </div>
          </section>

          <section className="paint-control-section">
            <h3>{isEnglish ? "Width" : "太さ"}</h3>
            <div className="paint-width-row">
              {[1, 3, 6, 10].map((width) => (
                <button
                  key={width}
                  type="button"
                  className={
                    paintPracticeWidth === width ? "is-selected" : ""
                  }
                  onClick={() => setPaintPracticeWidth(width)}
                  disabled={!isPaintDrawingReady}
                  aria-label={
                    isEnglish ? `Line width ${width}` : `線の太さ ${width}`
                  }
                >
                  <span style={{ height: `${Math.max(1, width / 2)}px` }} />
                </button>
              ))}
            </div>
          </section>

          <section className="paint-control-section">
            <h3>{isEnglish ? "Actions" : "操作"}</h3>
            <div className="paint-action-grid">
              <button
                type="button"
                onClick={undoPaintDrawing}
                disabled={paintUndoStack.length === 0}
              >
                ↶ {ui.undo}
              </button>
              <button
                type="button"
                onClick={redoPaintDrawing}
                disabled={paintRedoStack.length === 0}
              >
                ↷ {ui.redo}
              </button>
              <button
                type="button"
                onClick={clearPaintDrawing}
                disabled={paintObjects.length === 0}
              >
                {ui.clearAll}
              </button>
            </div>
          </section>
          {paintStatusMessage && (
            <p className="paint-status-message">{paintStatusMessage}</p>
          )}
        </div>

        <div className="paint-panel-footer">
          <button
            type="button"
            onClick={downloadPaintPng}
            disabled={!isPaintDrawingReady}
          >
            {ui.downloadPng}
          </button>
          <button
            type="button"
            onClick={saveCurrentPaintPractice}
            disabled={!isPaintDrawingReady}
          >
            {ui.savePaint}
          </button>
          <button type="button" onClick={openPaintHistory}>
            {ui.viewHistory}
          </button>
        </div>
      </aside>

      {isPaintHistoryOpen && (
        <div
          className="paint-history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsPaintHistoryOpen(false);
            }
          }}
        >
          <section
            className="paint-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={ui.paintHistory}
          >
            <div className="paint-history-header">
              <div>
                <h2>{ui.paintHistory}</h2>
                <span>
                  {isEnglish
                    ? "Paint results saved in IndexedDB"
                    : "IndexedDBに保存されたペイント結果"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPaintHistoryOpen(false)}
                aria-label={isEnglish ? "Close paint history" : "ペイント履歴を閉じる"}
              >
                ×
              </button>
            </div>

            {paintSavedItems.length === 0 ? (
              <div className="empty-paint-history">
                {ui.noSavedPaint}
              </div>
            ) : (
              <div className="paint-history-list">
                {paintSavedItems.map((item) => (
                  <article className="paint-history-item" key={item.id}>
                    <img
                      src={item.backgroundDataUrl}
                      alt={`${item.stockCode} ${item.targetDate}のペイント`}
                    />
                    <div>
                      <strong>
                        {item.stockCode} {item.stockName}
                      </strong>
                      <span>{formatDateWithWeekday(item.targetDate)}</span>
                      <small>
                        {new Date(item.createdAt).toLocaleString("ja-JP")}
                      </small>
                      {item.note && <p>{item.note}</p>}
                    </div>
                    <div className="paint-history-actions">
                      <button
                        type="button"
                        onClick={() => loadSavedPaintPractice(item)}
                      >
                        {ui.load}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedPaintPractice(item.id)}
                      >
                        {ui.delete}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {!isPaintPracticeOpen && (
        <button
          type="button"
          className="paint-panel-open-button"
          onClick={openPaintPractice}
          title={isEnglish ? "Open paint practice" : "ペイント練習を開く"}
          aria-label={isEnglish ? "Open paint practice" : "ペイント練習を開く"}
        >
          <span className="paint-panel-open-arrow">›</span>
          <span className="paint-panel-open-label">{ui.paintPractice}</span>
        </button>
      )}

      <aside
        className="trade-panel"
        aria-label={ui.tradePractice}
        aria-hidden={!isTradePanelOpen}
      >
        <section className="trade-section position-section">
          <div className="section-heading-row">
            <h2>{ui.currentPosition}</h2>
            <div className="panel-header-actions">
              <span className="mock-badge">FIFO</span>
              <button
                type="button"
                className="panel-toggle-button"
                onClick={() => setIsTradePanelOpen(false)}
                title={isEnglish ? "Close trade panel" : "売買パネルを閉じる"}
                aria-label={isEnglish ? "Close trade panel" : "売買パネルを閉じる"}
              >
                ›
              </button>
            </div>
          </div>

          <div className="position-display">
            <div className="position-side position-short">
              <span>{ui.shortLots}</span>
              <strong>{currentShortLots}</strong>
            </div>
            <span className="position-separator">-</span>
            <div className="position-side position-long">
              <span>{ui.longLots}</span>
              <strong>{currentLongLots}</strong>
            </div>
          </div>
        </section>

        <section className="trade-section profit-section">
          <div className="section-heading-row">
            <h2>{ui.profit}</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowProfit((value) => !value)}
              title={showProfit ? ui.hide : ui.show}
              aria-label={showProfit ? ui.hide : ui.show}
            >
              {showProfit ? ui.show : ui.hide}
            </button>
          </div>

          <dl className="profit-list">
            <div>
              <dt>{ui.realizedProfit}</dt>
              <dd className={profitClassName(realizedProfit)}>
                {showProfit
                  ? formatCurrencyAmount(
                      realizedProfit,
                      selectedInstrument.currency
                    )
                  : "••••••"}
              </dd>
            </div>
            <div>
              <dt>{ui.unrealizedProfit}</dt>
              <dd className={profitClassName(unrealizedProfit)}>
                {showProfit
                  ? formatCurrencyAmount(
                      unrealizedProfit,
                      selectedInstrument.currency
                    )
                  : "••••••"}
              </dd>
            </div>
            <div className="profit-total">
              <dt>{ui.totalProfit}</dt>
              <dd className={profitClassName(totalProfit)}>
                {showProfit
                  ? formatCurrencyAmount(
                      totalProfit,
                      selectedInstrument.currency
                    )
                  : "••••••"}
              </dd>
            </div>
          </dl>
          <div className="section-heading-row trade-score-heading">
            <h2>{ui.tradeScore}</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowTradeScore((value) => !value)}
              title={showTradeScore ? ui.hide : ui.show}
              aria-label={showTradeScore ? ui.hide : ui.show}
            >
              {showTradeScore ? ui.show : ui.hide}
            </button>
          </div>
          <div className="trade-score">
            <strong className="score-win">
              {ui.win} {showTradeScore ? tradeOutcomeCounts.win : "-"}
            </strong>
            <strong className="score-loss">
              {ui.loss} {showTradeScore ? tradeOutcomeCounts.loss : "-"}
            </strong>
            <strong className="score-draw">
              {ui.draw} {showTradeScore ? tradeOutcomeCounts.draw : "-"}
            </strong>
          </div>
        </section>

        <section className="trade-section order-section">
          <h2>{ui.order}</h2>

          <div className="order-action-grid">
            {(
              [
                "add-short",
                "close-short",
                "add-long",
                "close-long",
              ] as OrderAction[]
            ).map((action) => {
              const isEnabled = canPlaceOrderAction(action);
              const actionCloseOrderAvailable = getCloseOrderAvailable(action);
              const isCloseAction =
                action === "close-short" || action === "close-long";

              return (
                <button
                  key={action}
                  type="button"
                  className={`order-action quick-order-action ${
                    action.includes("short") ? "is-short" : "is-long"
                  }`}
                  onClick={() => {
                    setOrderAction(action);
                    showOrderMessage("");
                    placeOrder(action);
                  }}
                  disabled={!isEnabled}
                  title={
                    !isEnabled && isCloseAction
                      ? `返済可能は${actionCloseOrderAvailable}玉まで`
                      : `${orderLots}玉で${orderActionLabel[action]}`
                  }
                >
                  <strong>{quickOrderLabel[action]}</strong>
                  <span>
                    {isCloseAction && !isEnabled
                      ? `返済可能 ${actionCloseOrderAvailable}玉`
                      : `${orderLots}玉`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="lot-control-row">
            <div>
              <span className="field-label">{ui.orderLots}</span>
              <span className="lot-summary">{instrumentUnitSummary}</span>
            </div>
            <div className="lot-stepper">
              <button
                type="button"
                onClick={() => setOrderLots((value) => Math.max(1, value - 1))}
                aria-label={isEnglish ? "Decrease order lots" : "注文玉数を減らす"}
              >
                -
              </button>
              <strong>{orderLots}玉</strong>
              <button
                type="button"
                onClick={() => setOrderLots((value) => Math.min(99, value + 1))}
                aria-label={isEnglish ? "Increase order lots" : "注文玉数を増やす"}
              >
                +
              </button>
            </div>
          </div>

          <details className="order-detail-settings">
            <summary>{ui.quantitySettings}</summary>
            <label className="lot-setting">
              <span>{ui.quantityPerLot}</span>
              <span className="lot-setting-control">
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  value={sharesPerLot}
                  aria-label={ui.quantityPerLot}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (Number.isFinite(nextValue) && nextValue >= 1) {
                      setSharesPerLot(Math.min(100000, Math.floor(nextValue)));
                    }
                  }}
                />
                {selectedInstrument.unitLabel}
              </span>
            </label>
            <div className="instrument-unit-summary">
              <span>{ui.calculationUnit}</span>
              <strong>
                {instrumentUnitSummary}
                {instrumentMultiplierSummary}
              </strong>
            </div>
          </details>

          {pendingOrders.length > 0 && (
            <div className="pending-order">
              <span>
                {ui.pendingOrders} {pendingOrders.length}
                {isEnglish ? "" : "件"}
              </span>
              {pendingOrders.map((order) => (
                <div className="pending-order-row" key={order.id}>
                  <strong>
                    {orderActionLabel[order.action]}・{order.lots}玉（
                    {formatQuantity(order.shares, selectedInstrument.unitLabel)}
                    ）
                  </strong>
                  <span>{formatDateWithWeekday(order.executeDate)}</span>
                  <button
                    type="button"
                    onClick={() => cancelPendingOrder(order.id)}
                  >
                    {ui.cancel}
                  </button>
                </div>
              ))}
            </div>
          )}

          {displayedOrderMessage && (
            <div className="order-message">{displayedOrderMessage}</div>
          )}
        </section>

        <section className="trade-section chart-memo-section">
          <div className="section-heading-row">
            <h2>{ui.chartMemo}</h2>
            <span className="mock-badge">{currentPaintMarks.length}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              color: "var(--text)",
              fontSize: "13px",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "var(--muted)",
                fontSize: "11px",
                lineHeight: 1.45,
              }}
            >
              {isEnglish
                ? "Record decisions and observations for the selected date."
                : "選択した日付に判断や気付きを記録します。"}
            </p>
            <div
              style={{
                padding: "8px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                backgroundColor: "var(--panel-muted)",
              }}
            >
              <span style={{ color: "var(--muted)" }}>{ui.targetDate}</span>
              <strong
                style={{
                  display: "block",
                  marginTop: "3px",
                  color: "var(--text)",
                }}
              >
                {paintTargetDate
                  ? formatDateWithWeekday(paintTargetDate)
                  : ui.selectCandle}
              </strong>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "6px",
              }}
            >
              <button
                type="button"
                onClick={() => addPaintMark("up")}
                disabled={!paintTargetDate}
                style={{
                  border: "1px solid #166534",
                  borderRadius: "8px",
                  backgroundColor: "#14532d",
                  color: "#dcfce7",
                  padding: "7px 4px",
                  cursor: paintTargetDate ? "pointer" : "not-allowed",
                  opacity: paintTargetDate ? 1 : 0.55,
                }}
              >
                ↑ {ui.buyCandidate}
              </button>
              <button
                type="button"
                onClick={() => addPaintMark("down")}
                disabled={!paintTargetDate}
                style={{
                  border: "1px solid #991b1b",
                  borderRadius: "8px",
                  backgroundColor: "#7f1d1d",
                  color: "#fee2e2",
                  padding: "7px 4px",
                  cursor: paintTargetDate ? "pointer" : "not-allowed",
                  opacity: paintTargetDate ? 1 : 0.55,
                }}
              >
                ↓ {ui.sellCandidate}
              </button>
              <button
                type="button"
                onClick={() => addPaintMark("memo")}
                disabled={!paintTargetDate}
                style={{
                  border: "1px solid #92400e",
                  borderRadius: "8px",
                  backgroundColor: "#78350f",
                  color: "#fef3c7",
                  padding: "7px 4px",
                  cursor: paintTargetDate ? "pointer" : "not-allowed",
                  opacity: paintTargetDate ? 1 : 0.55,
                }}
              >
                {ui.addMemo}
              </button>
            </div>

            {selectedDatePaintMarks.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  maxHeight: "136px",
                  overflow: "auto",
                }}
              >
                {selectedDatePaintMarks.map((mark) => (
                  <div
                    key={mark.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "58px 1fr auto",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      backgroundColor: "#111827",
                    }}
                  >
                    <strong style={{ color: "#e5e7eb" }}>
                      {paintMarkTypeLabels[mark.type]}
                    </strong>
                    <span
                      style={{
                        color: "#cbd5e1",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getPaintMarkDisplayText(mark)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deletePaintMark(mark.id)}
                      style={{
                        border: "1px solid #475569",
                        borderRadius: "6px",
                        backgroundColor: "#1f2937",
                        color: "#f8fafc",
                        padding: "4px 6px",
                        cursor: "pointer",
                      }}
                    >
                      {ui.delete}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {currentPaintMarks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      isEnglish
                        ? "Delete all chart memos for this symbol?"
                        : "この銘柄のチャートメモをすべて削除しますか？"
                    )
                  ) {
                    clearCurrentStockPaintMarks();
                  }
                }}
                style={{
                  border: "1px solid #7f1d1d",
                  borderRadius: "8px",
                  backgroundColor: "#450a0a",
                  color: "#fecaca",
                  padding: "7px",
                  cursor: "pointer",
                }}
              >
                {ui.clearStockMemos}
              </button>
            )}
          </div>
        </section>

        <div className="trade-panel-footer">
          <button type="button" onClick={() => setIsTradeLogOpen(true)}>
            {ui.tradeLog}
            {currentBook.logs.length > 0 ? ` (${currentBook.logs.length})` : ""}
          </button>
          <button
            type="button"
            onClick={exportTradeLogCsv}
            disabled={currentBook.logs.length === 0}
            title={
              currentBook.logs.length === 0
                ? isEnglish
                  ? "No executed trades to export"
                  : "約定履歴がないためCSV出力できません"
                : isEnglish
                  ? "Export trade log as CSV"
                  : "売買ログをCSV出力します"
            }
          >
            {ui.exportCsv}
          </button>
          <button
            type="button"
            className="reset-button"
            onClick={() => {
              if (
                window.confirm(
                  isEnglish
                    ? "Clear positions and trade logs for this symbol?"
                    : "この銘柄の建玉と売買ログを消去しますか？"
                )
              ) {
                resetTradingBook();
              }
            }}
          >
            {ui.resetPractice}
          </button>
        </div>
      </aside>

      {isAppearanceSettingsOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsAppearanceSettingsOpen(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(2, 6, 23, 0.42)",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="外観設定"
            style={{
              width: "min(860px, calc(100vw - 48px))",
              maxHeight: "calc(100vh - 48px)",
              overflow: "auto",
              border: "1px solid #334155",
              borderRadius: "10px",
              background:
                "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.98))",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
              color: "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px 14px",
                borderBottom: "1px solid #334155",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "20px" }}>{ui.settings}</h2>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: "#94a3b8",
                    fontSize: "12px",
                  }}
                >
                  {ui.settingsDescription}
                </p>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "10px",
                    color: "#cbd5e1",
                    fontSize: "13px",
                  }}
                >
                  <span>{ui.language}</span>
                  <select
                    value={language}
                    onChange={(event) =>
                      setLanguage(event.target.value as AppLanguage)
                    }
                    style={{
                      border: "1px solid #475569",
                      borderRadius: "6px",
                      backgroundColor: "#111827",
                      color: "#f8fafc",
                      padding: "6px 8px",
                    }}
                  >
                    <option value="ja">日本語</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  const savedSettings = loadChartSettingsFromStorage();
                  setMaDisplaySettings(savedSettings.maSettings);
                  setAppearanceSettings(savedSettings.appearanceSettings);
                  setTradingSettings(savedSettings.tradingSettings);
                  setViewSettings(savedSettings.viewSettings);
                  setLanguage(savedSettings.language);
                  setIsAppearanceSettingsOpen(false);
                }}
                aria-label={isEnglish ? "Close settings" : "外観設定を閉じる"}
                style={{
                  width: "34px",
                  height: "34px",
                  border: "1px solid #475569",
                  borderRadius: "6px",
                  backgroundColor: "#111827",
                  color: "#f8fafc",
                  cursor: "pointer",
                  fontSize: "20px",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "16px 22px 20px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                {(
                  [
                    { value: "ma", label: ui.movingAverages },
                    {
                      value: "view",
                      label: isEnglish ? "Display" : "表示",
                    },
                    { value: "appearance", label: ui.chartAppearance },
                    { value: "trading", label: ui.tradeSettings },
                  ] as Array<{ value: SettingsTab; label: string }>
                ).map((tab) => {
                  const isActive = settingsTab === tab.value;

                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setSettingsTab(tab.value)}
                      style={{
                        padding: "10px 12px",
                        border: isActive
                          ? "1px solid #60a5fa"
                          : "1px solid #334155",
                        borderRadius: "6px",
                        backgroundColor: isActive ? "#1d4ed8" : "#111827",
                        color: "#f8fafc",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {settingsTab === "ma" ? (
                <div
                  style={{
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "rgba(15, 23, 42, 0.72)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "64px 96px 72px 88px 118px 92px 128px 64px",
                      gap: "8px",
                      alignItems: "center",
                      padding: "10px 12px",
                      color: "#94a3b8",
                      fontSize: "12px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <span>{isEnglish ? "Display" : "表示"}</span>
                    <span>{isEnglish ? "Period" : "期間"}</span>
                    <span>{isEnglish ? "Color" : "色"}</span>
                    <span>{isEnglish ? "Width" : "線の太さ"}</span>
                    <span>{isEnglish ? "Style" : "スタイル"}</span>
                    <span>{isEnglish ? "Sample" : "見本"}</span>
                    <span>{isEnglish ? "Opacity" : "透明度"}</span>
                    <span>{ui.delete}</span>
                  </div>

                  {maDisplaySettings.map((setting) => (
                    <div
                      key={setting.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "64px 96px 72px 88px 118px 92px 128px 64px",
                        gap: "8px",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderBottom: "1px solid #1f2937",
                      }}
                    >
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          color: "#cbd5e1",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={setting.enabled}
                          onChange={(event) =>
                            updateMaDisplaySetting(setting.id, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        ON
                      </label>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <input
                          type="number"
                          min="1"
                          max="250"
                          step="1"
                          value={setting.period}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            if (Number.isFinite(nextValue) && nextValue >= 1) {
                              const nextPeriod = Math.min(
                                250,
                                Math.floor(nextValue)
                              );
                              updateMaDisplaySetting(setting.id, {
                                period: nextPeriod,
                              });
                            }
                          }}
                          style={{
                            width: "56px",
                            boxSizing: "border-box",
                            border: "1px solid #475569",
                            borderRadius: "5px",
                            backgroundColor: "#111827",
                            color: "#f8fafc",
                            padding: "6px",
                          }}
                        />
                        {isEnglish ? "d" : "日"}
                      </label>
                      <input
                        type="color"
                        value={setting.color}
                        onChange={(event) =>
                          updateMaDisplaySetting(setting.id, {
                            color: event.target.value,
                          })
                        }
                        aria-label={
                          isEnglish
                            ? `${setting.period} day moving average color`
                            : `${setting.period}日の色`
                        }
                        style={{
                          width: "44px",
                          height: "32px",
                          padding: "2px",
                          border: "1px solid #475569",
                          borderRadius: "5px",
                          backgroundColor: "#111827",
                        }}
                      />
                      <select
                        value={setting.width}
                        onChange={(event) =>
                          updateMaDisplaySetting(setting.id, {
                            width: Number(event.target.value),
                          })
                        }
                        style={{
                          border: "1px solid #475569",
                          borderRadius: "5px",
                          backgroundColor: "#111827",
                          color: "#f8fafc",
                          padding: "6px",
                        }}
                      >
                        {[1, 2, 3, 4].map((width) => (
                          <option key={width} value={width}>
                            {width}px
                          </option>
                        ))}
                      </select>
                      <select
                        value={setting.style}
                        onChange={(event) =>
                          updateMaDisplaySetting(setting.id, {
                            style: event.target.value as MaLineStyleOption,
                          })
                        }
                        style={{
                          border: "1px solid #475569",
                          borderRadius: "5px",
                          backgroundColor: "#111827",
                          color: "#f8fafc",
                          padding: "6px",
                          minWidth: "108px",
                        }}
                      >
                        {(Object.keys(maLineStyleLabels) as MaLineStyleOption[]).map(
                          (style) => (
                            <option key={style} value={style}>
                              {maLineStyleLabels[style]}
                            </option>
                          )
                        )}
                      </select>
                      <LineStylePreview
                        style={setting.style}
                        color={setting.enabled ? setting.color : "#64748b"}
                        width={setting.width}
                        muted={!setting.enabled}
                      />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <input
                          type="range"
                          min="20"
                          max="100"
                          step="5"
                          value={Math.round(setting.opacity * 100)}
                          onChange={(event) =>
                            updateMaDisplaySetting(setting.id, {
                              opacity: Number(event.target.value) / 100,
                            })
                          }
                          aria-label={
                            isEnglish
                              ? `${setting.period} day moving average opacity`
                              : `${setting.period}日の透明度`
                          }
                          style={{ width: "76px" }}
                        />
                        <span
                          style={{
                            color: "#cbd5e1",
                            fontSize: "12px",
                            minWidth: "34px",
                          }}
                        >
                          {Math.round(setting.opacity * 100)}%
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMaDisplaySetting(setting.id)}
                        style={{
                          border: "1px solid #475569",
                          borderRadius: "5px",
                          backgroundColor: "#111827",
                          color: "#f8fafc",
                          padding: "6px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {ui.delete}
                      </button>
                    </div>
                  ))}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      padding: "10px 12px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <button
                      type="button"
                      onClick={addMaDisplaySetting}
                      style={{
                        border: "1px solid #60a5fa",
                        borderRadius: "6px",
                        backgroundColor: "#1d4ed8",
                        color: "#f8fafc",
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ＋ {isEnglish ? "Add Moving Average" : "移動平均線を追加"}
                    </button>
                  </div>

                  <div style={{ padding: "12px 12px 0" }}>
                    <div
                      style={{
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        padding: "10px 12px",
                        color: "#94a3b8",
                        fontSize: "12px",
                      }}
                    >
                      {isEnglish ? "Line Style Samples" : "線スタイル見本"}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
                          gap: "10px 14px",
                          marginTop: "10px",
                        }}
                      >
                        {(Object.keys(maLineStyleLabels) as MaLineStyleOption[]).map(
                          (style) => (
                            <LineStylePreview
                              key={style}
                              style={style}
                              label={maLineStyleLabels[style]}
                            />
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "12px" }}>
                    <div
                      style={{
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        padding: "10px 12px",
                        color: "#94a3b8",
                        fontSize: "12px",
                      }}
                    >
                      {isEnglish ? "Preview" : "プレビュー"}
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "center",
                          marginTop: "10px",
                        }}
                      >
                        {maDisplaySettings.map((setting) => (
                          <svg
                            key={setting.id}
                            width="52"
                            height="14"
                            viewBox="0 0 52 14"
                            style={{ opacity: setting.enabled ? setting.opacity : 0.28 }}
                          >
                            <title>{`${setting.period}日`}</title>
                            <line
                              x1="3"
                              y1="7"
                              x2="49"
                              y2="7"
                              stroke={setting.enabled ? setting.color : "#475569"}
                              strokeWidth={Math.max(1, setting.width)}
                              strokeLinecap="round"
                              strokeDasharray={getLineStyleDashArray(setting.style)}
                            />
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : settingsTab === "view" ? (
                <div
                  style={{
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "rgba(15, 23, 42, 0.72)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "start",
                      gap: "12px",
                      padding: "14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <strong>
                      {isEnglish ? "Bars on Display" : "表示本数"}
                    </strong>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {(
                        [
                          {
                            value: "auto",
                            label: isEnglish ? "Always Auto" : "毎回自動",
                            description: isEnglish
                              ? "Choose a suitable number of bars from the current chart width."
                              : "画面幅から毎回ちょうどよい本数を自動で決めます。",
                          },
                          {
                            value: "remember",
                            label: isEnglish ? "Use Last Count" : "前回を引き継ぐ",
                            description: isEnglish
                              ? "Reuse the last visible bar count for each symbol and timeframe."
                              : "銘柄と足種ごとに、前回表示していた本数を引き継ぎます。",
                          },
                          {
                            value: "fixed",
                            label: isEnglish ? "Fixed Count" : "固定本数",
                            description: isEnglish
                              ? "Always start from the fixed bar count below."
                              : "下で指定した本数を常に使います。",
                          },
                        ] as Array<{
                          value: DisplayBarsMode;
                          label: string;
                          description: string;
                        }>
                      ).map((option) => {
                        const isActive =
                          viewSettings.displayBarsMode === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setIsChartLoading(true);
                              setViewSettings((settings) => ({
                                ...settings,
                                displayBarsMode: option.value,
                              }));
                              setDisplayBarsOption(
                                option.value === "auto"
                                  ? "auto"
                                  : option.value === "remember"
                                    ? "remember"
                                    : (String(
                                        viewSettings.fixedDisplayBars
                                      ) as DisplayBarsOption)
                              );
                            }}
                            style={{
                              display: "grid",
                              gap: "4px",
                              border: isActive
                                ? "1px solid #60a5fa"
                                : "1px solid #475569",
                              borderRadius: "7px",
                              backgroundColor: isActive ? "#1d4ed8" : "#111827",
                              color: "#f8fafc",
                              padding: "10px 12px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>
                              {option.label}
                            </span>
                            <span style={{ color: "#cbd5e1", fontSize: "12px" }}>
                              {option.description}
                            </span>
                          </button>
                        );
                      })}
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          color: "#cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <span>
                          {isEnglish ? "Fixed bars" : "固定本数"}
                        </span>
                        <select
                          value={String(viewSettings.fixedDisplayBars)}
                          onChange={(event) => {
                            const fixedDisplayBars = Number(event.target.value);
                            setIsChartLoading(true);
                            setViewSettings((settings) => ({
                              ...settings,
                              displayBarsMode: "fixed",
                              fixedDisplayBars,
                            }));
                            setDisplayBarsOption(
                              event.target.value as DisplayBarsOption
                            );
                          }}
                          style={{
                            border: "1px solid #475569",
                            borderRadius: "6px",
                            backgroundColor: "#111827",
                            color: "#f8fafc",
                            padding: "7px 8px",
                          }}
                        >
                          {["50", "75", "100", "150", "200"].map((value) => (
                            <option key={value} value={value}>
                              {value}
                              {ui.barsSuffix}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "start",
                      gap: "12px",
                      padding: "14px",
                    }}
                  >
                    <strong>
                      {isEnglish ? "Initial Position" : "初期表示位置"}
                    </strong>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {(
                        [
                          {
                            value: "latest",
                            label: isEnglish ? "Latest" : "最新",
                            description: isEnglish
                              ? "Open at the latest available data."
                              : "データの一番新しい位置で開きます。",
                          },
                          {
                            value: "offset",
                            label: isEnglish
                              ? "N bars before latest"
                              : "最新からN本前",
                            description: isEnglish
                              ? "Open a little before the latest data for practice."
                              : "練習しやすいように、最新より少し前で開きます。",
                          },
                          {
                            value: "remember",
                            label: isEnglish
                              ? "Continue from last"
                              : "前回の続き",
                            description: isEnglish
                              ? "Open at the last right-edge date for each symbol and timeframe."
                              : "銘柄と足種ごとに、前回の右端日付から再開します。",
                          },
                          {
                            value: "earliest",
                            label: isEnglish ? "Near beginning" : "最初の方",
                            description: isEnglish
                              ? "Open near the beginning of the data."
                              : "データの最初の方から開きます。",
                          },
                        ] as Array<{
                          value: InitialPositionMode;
                          label: string;
                          description: string;
                        }>
                      ).map((option) => {
                        const isActive =
                          viewSettings.initialPositionMode === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              anchorDailyDateRef.current = null;
                              visibleLogicalRangeRef.current = null;
                              setIsChartLoading(true);
                              setViewSettings((settings) => ({
                                ...settings,
                                initialPositionMode: option.value,
                              }));
                            }}
                            style={{
                              display: "grid",
                              gap: "4px",
                              border: isActive
                                ? "1px solid #60a5fa"
                                : "1px solid #475569",
                              borderRadius: "7px",
                              backgroundColor: isActive ? "#1d4ed8" : "#111827",
                              color: "#f8fafc",
                              padding: "10px 12px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>
                              {option.label}
                            </span>
                            <span style={{ color: "#cbd5e1", fontSize: "12px" }}>
                              {option.description}
                            </span>
                          </button>
                        );
                      })}
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          color: "#cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <span>
                          {isEnglish ? "Bars before latest" : "最新から戻す本数"}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="5000"
                          step="10"
                          value={viewSettings.initialPositionOffsetBars}
                          onChange={(event) => {
                            const nextValue = Math.round(
                              clampNumber(Number(event.target.value), 0, 5000, 100)
                            );
                            anchorDailyDateRef.current = null;
                            visibleLogicalRangeRef.current = null;
                            setIsChartLoading(true);
                            setViewSettings((settings) => ({
                              ...settings,
                              initialPositionMode: "offset",
                              initialPositionOffsetBars: nextValue,
                            }));
                          }}
                          style={{
                            width: "92px",
                            border: "1px solid #475569",
                            borderRadius: "6px",
                            backgroundColor: "#111827",
                            color: "#f8fafc",
                            padding: "7px 8px",
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : settingsTab === "trading" ? (
                <div
                  style={{
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "rgba(15, 23, 42, 0.72)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "start",
                      gap: "12px",
                      padding: "14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <strong>{isEnglish ? "Execution Timing" : "約定タイミング"}</strong>
                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      {(
                        [
                          {
                            value: "next-open",
                            label: ui.nextOpen,
                            description:
                              isEnglish
                                ? "Orders are filled at the next trading day's open."
                                : "今まで通りの動きです。注文した次の取引日の始値で約定します。",
                          },
                          {
                            value: "same-close",
                            label: ui.sameClose,
                            description:
                              isEnglish
                                ? "Orders are filled at the selected day's close."
                                : "表示中の日付の終値で約定します。終値ベースで素早く検証したい時に使います。",
                          },
                        ] as Array<{
                          value: ExecutionTiming;
                          label: string;
                          description: string;
                        }>
                      ).map((option) => {
                        const isActive =
                          tradingSettings.executionTiming === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setTradingSettings((settings) => ({
                                ...settings,
                                executionTiming: option.value,
                              }))
                            }
                            style={{
                              display: "grid",
                              gap: "4px",
                              border: isActive
                                ? "1px solid #60a5fa"
                                : "1px solid #475569",
                              borderRadius: "7px",
                              backgroundColor: isActive ? "#1d4ed8" : "#111827",
                              color: "#f8fafc",
                              padding: "10px 12px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>
                              {option.label}
                            </span>
                            <span style={{ color: "#cbd5e1", fontSize: "12px" }}>
                              {option.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <label
                      style={{
                        display: "grid",
                        gridTemplateColumns: "180px 1fr",
                        alignItems: "center",
                        gap: "12px",
                        color: "#f8fafc",
                      }}
                    >
                      <strong>
                        {isEnglish ? "Draw Threshold" : "引き分け基準"}
                      </strong>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                          color: "#cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.1"
                          value={Number(
                            (tradingSettings.drawRateThreshold * 100).toFixed(2)
                          )}
                          onChange={(event) => {
                            const nextRate =
                              clampNumber(
                                Number(event.target.value),
                                0,
                                20,
                                DEFAULT_TRADE_DRAW_RATE_THRESHOLD * 100
                              ) / 100;
                            setTradingSettings((settings) => ({
                              ...settings,
                              drawRateThreshold: nextRate,
                            }));
                          }}
                          style={{
                            width: "90px",
                            border: "1px solid #475569",
                            borderRadius: "6px",
                            backgroundColor: "#111827",
                            color: "#f8fafc",
                            padding: "7px 8px",
                          }}
                        />
                        <span>%</span>
                        <span>
                          {isEnglish
                            ? "Profit or loss below this rate is counted as a draw."
                            : "損益率がこの割合未満なら引き分けにします。"}
                        </span>
                      </span>
                    </label>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      color: "#94a3b8",
                      fontSize: "12px",
                      lineHeight: 1.7,
                    }}
                  >
                    {isEnglish
                      ? "Changes apply to new orders. Existing pending orders keep the timing selected when they were placed."
                      : "変更後に入れる注文から反映されます。すでに注文済みの約定予定は、注文時の設定で処理されます。"}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "rgba(15, 23, 42, 0.72)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <strong>{isEnglish ? 'Background Theme' : '背景テーマ'}</strong>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(Object.keys(chartThemeLabels) as ChartTheme[]).map(
                        (theme) => {
                          const isActive = appearanceSettings.theme === theme;

                          return (
                            <button
                              key={theme}
                              type="button"
                              onClick={() =>
                                updateAppearanceSetting("theme", theme)
                              }
                              style={{
                                border: isActive
                                  ? "1px solid #60a5fa"
                                  : "1px solid #475569",
                                borderRadius: "999px",
                                backgroundColor: isActive ? "#1d4ed8" : "#111827",
                                color: "#f8fafc",
                                padding: "6px 12px",
                                cursor: "pointer",
                              }}
                            >
                              {isEnglish
                                ? {
                                    dark: "Dark",
                                    "dark-blue": "Dark Blue",
                                    black: "Black",
                                    light: "Light",
                                    "light-gray": "Light Gray",
                                    ivory: "Ivory",
                                  }[theme]
                                : chartThemeLabels[theme]}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <strong>{isEnglish ? 'Grid' : 'グリッド表示'}</strong>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#cbd5e1",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={appearanceSettings.gridVisible}
                        onChange={(event) =>
                          updateAppearanceSetting(
                            "gridVisible",
                            event.target.checked
                          )
                        }
                      />
                      {isEnglish ? 'Show' : '表示する'}
                    </label>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <strong>{isEnglish ? 'Grid Strength' : 'グリッドの濃さ'}</strong>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {(["small", "medium", "large"] as SettingSize[]).map(
                        (size) => {
                          const isActive = appearanceSettings.gridDensity === size;

                          return (
                            <button
                              key={size}
                              type="button"
                              onClick={() =>
                                updateAppearanceSetting("gridDensity", size)
                              }
                              style={{
                                minWidth: "70px",
                                border: isActive
                                  ? "1px solid #60a5fa"
                                  : "1px solid #475569",
                                borderRadius: "5px",
                                backgroundColor: isActive ? "#1d4ed8" : "#111827",
                                color: "#f8fafc",
                                padding: "7px 10px",
                                cursor: "pointer",
                              }}
                            >
                              {size === "small"
                                ? isEnglish
                                  ? "Light"
                                  : "薄い"
                                : size === "medium"
                                  ? isEnglish
                                    ? "Medium"
                                    : "中"
                                  : isEnglish
                                    ? "Strong"
                                    : "濃い"}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      alignItems: "start",
                      gap: "12px",
                      padding: "12px 14px",
                      borderBottom: "1px solid #334155",
                    }}
                  >
                    <strong>{isEnglish ? "Color Presets" : "配色プリセット"}</strong>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: "8px",
                      }}
                    >
                      {chartColorPresets.map((preset) => {
                        const isActive =
                          appearanceSettings.bullishColor.toLowerCase() ===
                            preset.bullishColor.toLowerCase() &&
                          appearanceSettings.bearishColor.toLowerCase() ===
                            preset.bearishColor.toLowerCase();

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              setAppearanceSettings((settings) => ({
                                ...settings,
                                bullishColor: preset.bullishColor,
                                bearishColor: preset.bearishColor,
                              }))
                            }
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: "5px",
                              border: isActive
                                ? "1px solid #60a5fa"
                                : "1px solid #475569",
                              borderRadius: "7px",
                              backgroundColor: isActive ? "#1d4ed8" : "#111827",
                              color: "#f8fafc",
                              padding: "8px 10px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                fontWeight: 700,
                              }}
                            >
                              <span
                                style={{
                                  width: "18px",
                                  height: "12px",
                                  borderRadius: "2px",
                                  backgroundColor: preset.bullishColor,
                                  border: "1px solid rgba(248, 250, 252, 0.45)",
                                }}
                              />
                              <span
                                style={{
                                  width: "18px",
                                  height: "12px",
                                  borderRadius: "2px",
                                  backgroundColor: preset.bearishColor,
                                  border: "1px solid rgba(248, 250, 252, 0.45)",
                                }}
                              />
                              {isEnglish ? preset.labelEn : preset.label}
                            </span>
                            <span style={{ color: "#cbd5e1", fontSize: "12px" }}>
                              {isEnglish
                                ? preset.descriptionEn
                                : preset.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(
                    [
                      [
                        "bullishColor",
                        isEnglish ? "Bullish Color (Rising)" : "陽線カラー（上昇）",
                      ],
                      [
                        "bearishColor",
                        isEnglish ? "Bearish Color (Falling)" : "陰線カラー（下落）",
                      ],
                    ] as Array<["bullishColor" | "bearishColor", string]>
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "180px 1fr",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 14px",
                        borderBottom: "1px solid #334155",
                      }}
                    >
                      <strong>{label}</strong>
                      <input
                        type="color"
                        value={appearanceSettings[key]}
                        onChange={(event) =>
                          updateAppearanceSetting(key, event.target.value)
                        }
                        aria-label={label}
                        style={{
                          width: "52px",
                          height: "34px",
                          padding: "2px",
                          border: "1px solid #475569",
                          borderRadius: "5px",
                          backgroundColor: "#111827",
                        }}
                      />
                    </div>
                  ))}

                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                padding: "14px 22px 18px",
                borderTop: "1px solid #334155",
              }}
            >
              <button
                type="button"
                onClick={resetDisplayedSettings}
                style={{
                  minWidth: "96px",
                  border: "1px solid #475569",
                  borderRadius: "6px",
                  backgroundColor: "#111827",
                  color: "#f8fafc",
                  padding: "9px 14px",
                  cursor: "pointer",
                }}
              >
                {isEnglish ? "Reset" : "リセット"}
              </button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const savedSettings = loadChartSettingsFromStorage();
                    setMaDisplaySettings(savedSettings.maSettings);
                    setAppearanceSettings(savedSettings.appearanceSettings);
                    setTradingSettings(savedSettings.tradingSettings);
                    setViewSettings(savedSettings.viewSettings);
                    setLanguage(savedSettings.language);
                    setIsAppearanceSettingsOpen(false);
                  }}
                  style={{
                    minWidth: "110px",
                    border: "1px solid #475569",
                    borderRadius: "6px",
                    backgroundColor: "#111827",
                    color: "#f8fafc",
                    padding: "9px 14px",
                    cursor: "pointer",
                  }}
                >
                  {ui.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveChartSettingsToStorage({
                      maSettings: maDisplaySettings,
                      appearanceSettings,
                      tradingSettings,
                      viewSettings,
                      language,
                    });
                    setIsAppearanceSettingsOpen(false);
                  }}
                  style={{
                    minWidth: "110px",
                    border: "1px solid #2563eb",
                    borderRadius: "6px",
                    backgroundColor: "#1d4ed8",
                    color: "#f8fafc",
                    padding: "9px 14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {ui.save}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {isTradeLogOpen && (
        <div
          className="trade-log-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsTradeLogOpen(false);
            }
          }}
        >
          <section
            className="trade-log-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={ui.tradeLog}
          >
            <div className="trade-log-header">
              <div>
                <h2>{ui.tradeLog}</h2>
                <span>
                  {getStockInfoFromPath(selectedDataPath).code}{" "}
                  {getStockInfoFromPath(selectedDataPath).name} / {ui.tradeScore}
                  : {ui.win} {tradeOutcomeCounts.win} - {ui.loss}{" "}
                  {tradeOutcomeCounts.loss} - {ui.draw}{" "}
                  {tradeOutcomeCounts.draw}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsTradeLogOpen(false)}
                aria-label={isEnglish ? "Close trade log" : "売買ログを閉じる"}
              >
                ×
              </button>
            </div>

            {currentBook.logs.length === 0 ? (
              <div className="empty-trade-log">
                {isEnglish ? "No executed trades yet" : "まだ約定履歴はありません"}
              </div>
            ) : (
              <div className="trade-log-list">
                {currentBook.logs.map((log) => {
                  const relatedIds = getRelatedTradeLogIds(log);
                  const outcome = getTradeOutcome(log);
                  const activeLog = currentBook.logs.find(
                    (item) => item.id === activeTradeLogId
                  );
                  const activeRelatedIds = activeLog
                    ? getRelatedTradeLogIds(activeLog)
                    : new Set<string>();
                  const isActive = activeTradeLogId === log.id;
                  const isRelated = activeRelatedIds.has(log.id);

                  return (
                    <div
                      className={`trade-log-row ${
                        isActive ? "is-active" : isRelated ? "is-related" : ""
                      }`}
                      key={log.id}
                      onMouseEnter={() => setActiveTradeLogId(log.id)}
                      onFocus={() => setActiveTradeLogId(log.id)}
                      onClick={() => setActiveTradeLogId(log.id)}
                    >
                      <div className="trade-log-summary">
                        <div>
                          <strong>{orderActionLabel[log.action]}</strong>
                          <span>
                            {log.lots}{isEnglish ? " lots" : "玉"}・
                            {formatQuantity(
                              log.shares,
                              selectedInstrument.unitLabel
                            )}
                            {relatedIds.size > 0
                              ? ` / ${ui.related} ${relatedIds.size}`
                              : ""}
                          </span>
                        </div>
                        {outcome && (
                          <span className={`trade-outcome-badge ${outcome}`}>
                            {tradeOutcomeLabel[outcome]}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteTradeLog(log.id);
                          }}
                        >
                          {ui.delete}
                        </button>
                      </div>
                      <div>
                        <span>{ui.orderedDate}</span>
                        <strong>{log.orderedDate}</strong>
                      </div>
                      <div>
                        <span>{ui.executedDate}</span>
                        <strong>{log.executionDate}</strong>
                      </div>
                      <div>
                        <span>{ui.executionPrice}</span>
                        <strong>
                          {formatCurrencyAmount(
                            log.executionPrice,
                            selectedInstrument.currency,
                            false
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>{ui.realizedProfit}</span>
                        <strong
                          className={
                            log.realizedProfit === null
                              ? "profit-neutral"
                              : profitClassName(log.realizedProfit)
                          }
                        >
                          {log.realizedProfit === null
                            ? "-"
                            : formatCurrencyAmount(
                                log.realizedProfit,
                                selectedInstrument.currency
                              )}
                        </strong>
                      </div>
                      {log.closedPositions && log.closedPositions.length > 0 && (
                        <div className="trade-log-closed-list">
                          <span>{ui.closedLots}</span>
                          {log.closedPositions.map((position) => (
                            <span key={position.id}>
                              <strong>{position.entryDate}</strong>{" "}
                              {formatCurrencyAmount(
                                position.entryPrice,
                                selectedInstrument.currency,
                                false
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {!isTradePanelOpen && !isPaintPracticeOpen && (
        <button
          type="button"
          className="panel-open-button"
          onClick={() => setIsTradePanelOpen(true)}
          title="売買パネルを開く"
          aria-label="売買パネルを開く"
        >
          <span className="panel-open-arrow">‹</span>
          <span className="panel-open-label">{ui.tradePractice}</span>
        </button>
      )}
    </div>
  );
}
