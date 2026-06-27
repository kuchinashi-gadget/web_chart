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
const SOUND_ENABLED_STORAGE_KEY = "stock-practice-sound-enabled-v1";
const PAINT_MARKS_STORAGE_KEY = "stock-practice-paint-marks-v1";
const PAINT_CUSTOM_COLORS_STORAGE_KEY = "stock-practice-paint-custom-colors-v1";
const PAINT_PRACTICE_DB_NAME = "stock-practice-paint-db";
const PAINT_PRACTICE_STORE_NAME = "paint-practices";


type Timeframe = "daily" | "weekly" | "monthly";
type VisibleLogicalRange = { from: number; to: number };
type DisplayBarsOption = "auto" | "50" | "75" | "100" | "150" | "200";
type SettingsTab = "ma" | "appearance" | "trading";
type ExecutionTiming = "next-open" | "same-close";
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
    description: "一般的な海外チャート風",
    bullishColor: "#22c55e",
    bearishColor: "#ef4444",
  },
  {
    id: "japanese-red-blue",
    label: "赤 / 青",
    description: "日本株チャート風",
    bullishColor: "#ef4444",
    bearishColor: "#2563eb",
  },
  {
    id: "red-green",
    label: "赤 / 緑",
    description: "国内ツールで見かける配色",
    bullishColor: "#ef4444",
    bearishColor: "#16a34a",
  },
  {
    id: "blue-red",
    label: "青 / 赤",
    description: "寒色系の上昇色",
    bullishColor: "#2563eb",
    bearishColor: "#ef4444",
  },
  {
    id: "black-gray",
    label: "黒 / グレー",
    description: "白背景向けモノクロ風",
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
};

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
  };
}

function loadChartSettingsFromStorage(): StoredChartSettings {
  if (typeof window === "undefined") {
    return {
      maSettings: DEFAULT_MA_DISPLAY_SETTINGS,
      appearanceSettings: DEFAULT_CHART_APPEARANCE_DRAFT,
      tradingSettings: DEFAULT_TRADING_SETTINGS_DRAFT,
    };
  }

  try {
    const raw = window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        maSettings: DEFAULT_MA_DISPLAY_SETTINGS,
        appearanceSettings: DEFAULT_CHART_APPEARANCE_DRAFT,
        tradingSettings: DEFAULT_TRADING_SETTINGS_DRAFT,
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
    };
  } catch (error) {
    console.warn("Failed to load chart settings", error);

    return {
      maSettings: DEFAULT_MA_DISPLAY_SETTINGS,
      appearanceSettings: DEFAULT_CHART_APPEARANCE_DRAFT,
      tradingSettings: DEFAULT_TRADING_SETTINGS_DRAFT,
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

const timeframeLabels: Record<Timeframe, string> = {
  daily: "日足",
  weekly: "週足",
  monthly: "月足",
};

const displayBarsOptions: Array<{ value: DisplayBarsOption; label: string }> = [
  { value: "auto", label: "自動" },
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
      grouped.set(key, { ...candle, sourceEndTime: candle.time });
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
    useState<DisplayBarsOption>("auto");
  const [autoDisplayBars, setAutoDisplayBars] = useState(100);
  const [visibleBarsCount, setVisibleBarsCount] = useState(0);
  const [orderAction, setOrderAction] = useState<OrderAction>("add-short");
  const [orderLots, setOrderLots] = useState(1);
  const [sharesPerLot, setSharesPerLot] = useState(
    () => getInstrumentDefinition(DATA_FILES[0]).defaultLotSize
  );
  const [showProfit, setShowProfit] = useState(true);
  const [isTradePanelOpen, setIsTradePanelOpen] = useState(false);
  const tradePanelBeforePaintRef = useRef(true);
  const [isPaintPracticeOpen, setIsPaintPracticeOpen] = useState(false);
  const [isPaintCanvasActive, setIsPaintCanvasActive] = useState(false);
  const [isPaintCanvasReady, setIsPaintCanvasReady] = useState(false);
  const [isPaintCapturing, setIsPaintCapturing] = useState(false);
  const [paintPracticeTool, setPaintPracticeTool] =
    useState<PaintPracticeTool>("line");
  const [paintPracticeColor, setPaintPracticeColor] = useState("#22c55e");
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
  const [isTradeLogOpen, setIsTradeLogOpen] = useState(false);
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
  const displayBars =
    displayBarsOption === "auto" ? autoDisplayBars : Number(displayBarsOption);
  const currentBook =
    tradingBooks[selectedDataPath] ?? createEmptyTradingBook();
  const currentPaintMarks = paintMarksByStock[selectedDataPath] ?? EMPTY_PAINT_MARKS;
  const paintTargetDate = dateInputValue;
  const selectedDatePaintMarks = paintTargetDate
    ? currentPaintMarks.filter((mark) => mark.date === paintTargetDate)
    : [];
  const isPaintDrawingReady = isPaintCanvasActive && isPaintCanvasReady;

  const playEffect = useCallback(
    (effect: SoundEffect) => playSoundEffect(effect, soundEnabled),
    [soundEnabled]
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
            shortPositions.push(
              ...Array.from({ length: pendingOrder.lots }, () => ({
                id: createId("short"),
                side: "short" as const,
                entryDate: pendingOrder.executeDate,
                entryPrice: executionPrice,
                sharesPerLot: pendingOrder.sharesPerLot,
              }))
            );
          } else if (pendingOrder.action === "add-long") {
            longPositions.push(
              ...Array.from({ length: pendingOrder.lots }, () => ({
                id: createId("long"),
                side: "long" as const,
                entryDate: pendingOrder.executeDate,
                entryPrice: executionPrice,
                sharesPerLot: pendingOrder.sharesPerLot,
              }))
            );
          } else if (pendingOrder.action === "close-short") {
            shortPositions = shortPositions.slice(pendingOrder.lots);
          } else {
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
      setOrderMessage(
        firstCandle
          ? `${formatDateWithWeekday(firstOrder.executeDate)}の${getExecutionTimingPriceLabel(
              firstOrder.executionTiming
            )} ${formatCurrencyAmount(
              getExecutionPrice(firstCandle, firstOrder.executionTiming),
              selectedInstrument.currency,
              false
            )}で${dueOrders.length}件約定しました`
          : `${dueOrders.length}件約定しました`
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
          anchorDailyDateRef.current =
            dailyCandles[dailyCandles.length - 1]?.time ?? "";
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

          const visibleTimes = new Set(availableCandles.map((candle) => candle.time));
          const visiblePaintMarkers: SeriesMarker<Time>[] = currentPaintMarks
            .filter((mark) => visibleTimes.has(mark.date))
            .map(
              (mark): SeriesMarker<Time> => ({
                time: mark.date,
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
          if (anchorDate) {
            setCalendarMonth(anchorDate.slice(0, 7));
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
          setCanNavigateForward(rightIndex < allCandles.length - 1);
          processPendingOrderRef.current?.(anchorDate, dailyCandles);
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

          rememberVisibleLogicalRange(clampedRange);
          syncVisibleRightEdge(clampedRange);

          const firstIndex = Math.max(0, Math.ceil(clampedRange.from));
          const lastIndex = Math.min(
            endIndex - 1,
            Math.floor(clampedRange.to)
          );
          const count = Math.max(0, lastIndex - firstIndex + 1);
          setVisibleBarsCount((current) => (current === count ? current : count));
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
          updateChart();
        };

        navigateRef.current = moveBars;
        jumpToDateRef.current = (date) => {
          const dailyDate = findDailyDateOnOrBefore(dailyCandles, date);
          if (!dailyDate) return;

          setIsChartLoading(true);
          anchorDailyDateRef.current = dailyDate;
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

      if (displayBarsOption !== "auto") return;

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
    displayBarsOption,
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
    "add-short": "売りを追加",
    "close-short": "売りを返済",
    "add-long": "買いを追加",
    "close-long": "買いを返済",
  };
  const quickOrderLabel: Record<OrderAction, string> = {
    "add-short": "売り +",
    "close-short": "売り -",
    "add-long": "買い +",
    "close-long": "買い -",
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

  const placeOrder = (action: OrderAction = orderAction) => {
    if (!dateInputValue) return;

    const actionCloseOrderAvailable = getCloseOrderAvailable(action);
    if (orderLots > actionCloseOrderAvailable) {
      playEffect("error");
      setOrderMessage("保有している玉数を超えて返済することはできません");
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
      setOrderMessage(
        executionTiming === "same-close"
          ? "対象日の終値がないため注文できません"
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
    setOrderMessage(
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
    setOrderMessage("注文を取り消しました");
  };

  const resetTradingBook = () => {
    setTradingBooks((books) => ({
      ...books,
      [selectedDataPath]: createEmptyTradingBook(),
    }));
    setOrderMessage("この銘柄の売買練習をリセットしました");
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
    setOrderMessage("売買ログをCSV出力しました");
    playEffect("success");
  };

  const resetDisplayedSettings = () => {
    setMaDisplaySettings(DEFAULT_MA_DISPLAY_SETTINGS);
    setAppearanceSettings(DEFAULT_CHART_APPEARANCE_DRAFT);
    setTradingSettings(DEFAULT_TRADING_SETTINGS_DRAFT);
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
      setOrderMessage("チャートの日付を選択してからメモを追加してください");
      return;
    }

    let text = "";
    if (type === "memo") {
      const enteredText = window.prompt("メモ内容を入力してください", "");
      if (enteredText === null) return;
      text = enteredText.trim();
      if (!text) {
        setOrderMessage("メモ内容が空のため追加しませんでした");
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
    setOrderMessage(
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
    setOrderMessage("チャートメモを削除しました");
  };

  const clearCurrentStockPaintMarks = () => {
    setPaintMarksByStock((marksByStock) => ({
      ...marksByStock,
      [selectedDataPath]: [],
    }));
    setOrderMessage("この銘柄のチャートメモをすべて削除しました");
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

  const updateCustomPaintColor = (colorValue: string) => {
    const color = colorValue.toLowerCase();
    setPaintPracticeColor(color);

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
      setPaintPracticeColor(paintPracticeColors[0]);
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

  const undoPaintDrawing = () => {
    const previous = paintUndoStack[paintUndoStack.length - 1];
    if (!previous) return;
    setPaintUndoStack((stack) => stack.slice(0, -1));
    setPaintRedoStack((stack) => [...stack, paintObjects]);
    setPaintObjects(previous);
  };

  const redoPaintDrawing = () => {
    const next = paintRedoStack[paintRedoStack.length - 1];
    if (!next) return;
    setPaintRedoStack((stack) => stack.slice(0, -1));
    setPaintUndoStack((stack) => [...stack, paintObjects]);
    setPaintObjects(next);
  };

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

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error(error);
      setOrderMessage("全画面表示を切り替えられませんでした");
    }
  };

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
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isShortcutDisabledTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (key === "d" || key === "w" || key === "m") {
        event.preventDefault();
        const nextTimeframe: Timeframe =
          key === "d" ? "daily" : key === "w" ? "weekly" : "monthly";
        if (timeframe !== nextTimeframe) {
          setIsChartLoading(true);
          setTimeframe(nextTimeframe);
        }
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
    isPaintHistoryOpen,
    isAppearanceSettingsOpen,
    isDatePickerOpen,
    openPaintPractice,
    closePaintPractice,
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
          <span className="visually-hidden">銘柄</span>
          <select
            className="stock-select"
            aria-label="銘柄"
            value={selectedDataPath}
            onChange={(event) => {
              const nextDataPath = event.target.value;
              anchorDailyDateRef.current = null;
              setCurrentDate("");
              setCurrentOhlc(null);
              setDateInputValue("");
              selectedChartDateRef.current = "";
              setSelectedChartDate("");
              setTradingDates(new Set());
              setSelectedDailyCandles([]);
              setOrderMessage("");
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
          <span className="toolbar-group-label">足種</span>
          <div className="segmented-control">
            {(["daily", "weekly", "monthly"] as Timeframe[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (timeframe === value) return;
                  setIsChartLoading(true);
                  setTimeframe(value);
                }}
                className={timeframe === value ? "is-active" : ""}
              >
                {timeframeLabels[value]}
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
          <span className="toolbar-group-label">表示</span>
          <select
            className="display-bars-select"
            value={displayBarsOption}
            onChange={(event) => {
              setIsChartLoading(true);
              setDisplayBarsOption(event.target.value as DisplayBarsOption);
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
                {option.label}
              </option>
            ))}
          </select>
          <span className="visible-bars-count">
            表示中 {visibleBarsCount || displayBars}本
          </span>
        </label>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title="Fキーでも切り替えできます"
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
          ⛶ {isFullscreen ? "全画面解除" : "全画面"}
        </button>

        <button
          type="button"
          onClick={() => setSoundEnabled((enabled) => !enabled)}
          title="効果音のオン・オフを切り替えます"
          aria-label="効果音のオン・オフ"
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
          {soundEnabled ? "🔊 音あり" : "🔇 ミュート"}
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
          ⚙ 設定
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
          aria-label="1本戻る"
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
          ← 1本戻る
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
            現在日付: {currentDate || "読み込み中"}
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
          aria-label="1本進む"
          disabled={!canNavigateForward}
          title={
            canNavigateForward
              ? "次の足へ進みます"
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
          1本進む →
        </button>

        <button
          type="button"
          className="selected-date-button"
          disabled={!selectedChartDate}
          onClick={() => jumpToDateRef.current?.(selectedChartDate)}
          title={
            selectedChartDate
              ? "選択した日をチャート右端へ移動します（Enter）"
              : "チャート上のローソク足をクリックしてください"
          }
        >
          {selectedChartDate
            ? `選択: ${formatDateWithWeekday(selectedChartDate)} → 右端`
            : "ローソク足を選択"}
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
            始値:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.open, selectedInstrument.priceDecimals)
              : "-"}
          </span>
          <span>
            高値:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.high, selectedInstrument.priceDecimals)
              : "-"}
          </span>
          <span>
            安値:{" "}
            {currentOhlc
              ? formatPrice(currentOhlc.low, selectedInstrument.priceDecimals)
              : "-"}
          </span>
          <span>
            終値:{" "}
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
                <strong>ペイントキャンバス</strong>
                <span>
                  {getStockInfoFromPath(selectedDataPath).code}{" "}
                  {getStockInfoFromPath(selectedDataPath).name}・
                  {dateInputValue
                    ? formatDateWithWeekday(dateInputValue)
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
                  <button type="submit" aria-label="テキストを追加">
                    追加
                  </button>
                  <button
                    type="button"
                    aria-label="テキスト入力を取消"
                    onClick={() => setPaintTextEditor(null)}
                  >
                    ×
                  </button>
                </form>
              )}
            </div>

            <label className="paint-note-area">
              <span>メモ（任意）</span>
              <textarea
                value={paintPracticeNote}
                onChange={(event) => setPaintPracticeNote(event.target.value)}
                placeholder="分析内容や振り返りを記録"
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
        aria-label="ペイント練習"
        aria-hidden={!isPaintPracticeOpen}
      >
        <div className="paint-panel-header">
          <div>
            <h2>ペイント練習</h2>
            <p>
              現在のチャートを画像として取り込み、線やメモを書き込んで振り返ります。
            </p>
          </div>
          <button
            type="button"
            onClick={closePaintPractice}
            aria-label="ペイント練習を閉じる"
          >
            ×
          </button>
        </div>

        <div className="paint-panel-body">
          <div className="paint-workflow">
            <span>ライブチャートで分析</span>
            <b>→</b>
            <span>スクショ取得</span>
            <b>→</b>
            <span>描画・振り返り</span>
          </div>

          <button
            type="button"
            className="capture-chart-button"
            onClick={captureChartForPaint}
            disabled={isPaintCapturing}
          >
            <span>▣</span>
            {isPaintCanvasActive
              ? "現在のチャート画像へ置き換え"
              : "現在のチャートをスクショして開始"}
          </button>
          <p className="capture-chart-help">
            押す前に日付・表示位置・縮尺を調整できます。
          </p>

          <section className="paint-control-section">
            <h3>描画ツール</h3>
            <div className="paint-tool-grid">
              {paintPracticeTools.map((tool) => (
                <button
                  key={tool.value}
                  type="button"
                  className={
                    paintPracticeTool === tool.value ? "is-selected" : ""
                  }
                  onClick={() => {
                    setPaintTextEditor(null);
                    setPaintPracticeTool(tool.value);
                  }}
                  disabled={!isPaintDrawingReady}
                >
                  {tool.value === "eraser" ? (
                    <span className="paint-eraser-icon" aria-hidden="true">
                      <i />
                    </span>
                  ) : (
                    <span>{tool.icon}</span>
                  )}
                  {tool.label}
                </button>
              ))}
            </div>
          </section>

          <section className="paint-control-section">
            <h3>色</h3>
            <div className="paint-color-row">
              {paintPracticeColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={
                    paintPracticeColor === color ? "is-selected" : ""
                  }
                  style={{ backgroundColor: color }}
                  onClick={() => setPaintPracticeColor(color)}
                  disabled={!isPaintDrawingReady}
                  aria-label={`描画色 ${color}`}
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
                    onClick={() => setPaintPracticeColor(color)}
                    disabled={!isPaintDrawingReady}
                    aria-label={`カスタム描画色 ${color}`}
                  />
                  <button
                    type="button"
                    className="paint-custom-swatch-remove"
                    onClick={() => removeCustomPaintColor(color)}
                    aria-label={`カスタム描画色 ${color}を削除`}
                    title="この色を削除"
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
                  aria-label="カスタム描画色"
                />
              </label>
            </div>
          </section>

          <section className="paint-control-section">
            <h3>太さ</h3>
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
                  aria-label={`線の太さ ${width}`}
                >
                  <span style={{ height: `${Math.max(1, width / 2)}px` }} />
                </button>
              ))}
            </div>
          </section>

          <section className="paint-control-section">
            <h3>操作</h3>
            <div className="paint-action-grid">
              <button
                type="button"
                onClick={undoPaintDrawing}
                disabled={paintUndoStack.length === 0}
              >
                ↶ 元に戻す
              </button>
              <button
                type="button"
                onClick={redoPaintDrawing}
                disabled={paintRedoStack.length === 0}
              >
                ↷ やり直し
              </button>
              <button
                type="button"
                onClick={clearPaintDrawing}
                disabled={paintObjects.length === 0}
              >
                全消去
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
            PNGダウンロード
          </button>
          <button
            type="button"
            onClick={saveCurrentPaintPractice}
            disabled={!isPaintDrawingReady}
          >
            ペイントを保存
          </button>
          <button type="button" onClick={openPaintHistory}>
            履歴を見る
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
            aria-label="ペイント履歴"
          >
            <div className="paint-history-header">
              <div>
                <h2>ペイント履歴</h2>
                <span>IndexedDBに保存されたペイント結果</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPaintHistoryOpen(false)}
                aria-label="ペイント履歴を閉じる"
              >
                ×
              </button>
            </div>

            {paintSavedItems.length === 0 ? (
              <div className="empty-paint-history">
                保存されたペイントはありません
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
                        読み込む
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedPaintPractice(item.id)}
                      >
                        削除
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
          title="ペイント練習を開く"
          aria-label="ペイント練習を開く"
        >
          <span className="paint-panel-open-arrow">›</span>
          <span className="paint-panel-open-label">ペイント練習</span>
        </button>
      )}

      <aside
        className="trade-panel"
        aria-label="売買練習パネル"
        aria-hidden={!isTradePanelOpen}
      >
        <section className="trade-section position-section">
          <div className="section-heading-row">
            <h2>現在の建玉</h2>
            <div className="panel-header-actions">
              <span className="mock-badge">FIFO</span>
              <button
                type="button"
                className="panel-toggle-button"
                onClick={() => setIsTradePanelOpen(false)}
                title="売買パネルを閉じる"
                aria-label="売買パネルを閉じる"
              >
                ›
              </button>
            </div>
          </div>

          <div className="position-display">
            <div className="position-side position-short">
              <span>売玉</span>
              <strong>{currentShortLots}</strong>
            </div>
            <span className="position-separator">-</span>
            <div className="position-side position-long">
              <span>買玉</span>
              <strong>{currentLongLots}</strong>
            </div>
          </div>
        </section>

        <section className="trade-section profit-section">
          <div className="section-heading-row">
            <h2>損益</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowProfit((value) => !value)}
              title={showProfit ? "損益を隠す" : "損益を表示"}
              aria-label={showProfit ? "損益を隠す" : "損益を表示"}
            >
              {showProfit ? "表示" : "非表示"}
            </button>
          </div>

          <dl className="profit-list">
            <div>
              <dt>確定損益</dt>
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
              <dt>含み損益</dt>
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
              <dt>総合損益</dt>
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
        </section>

        <section className="trade-section order-section">
          <h2>注文</h2>

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
                    setOrderMessage("");
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
              <span className="field-label">注文玉数</span>
              <span className="lot-summary">{instrumentUnitSummary}</span>
            </div>
            <div className="lot-stepper">
              <button
                type="button"
                onClick={() => setOrderLots((value) => Math.max(1, value - 1))}
                aria-label="注文玉数を減らす"
              >
                -
              </button>
              <strong>{orderLots}玉</strong>
              <button
                type="button"
                onClick={() => setOrderLots((value) => Math.min(99, value + 1))}
                aria-label="注文玉数を増やす"
              >
                +
              </button>
            </div>
          </div>

          <details className="order-detail-settings">
            <summary>数量設定</summary>
            <label className="lot-setting">
              <span>1玉あたり数量</span>
              <span className="lot-setting-control">
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  value={sharesPerLot}
                  aria-label="1玉あたり数量"
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
              <span>計算単位</span>
              <strong>
                {instrumentUnitSummary}
                {instrumentMultiplierSummary}
              </strong>
            </div>
          </details>

          <div className="execution-row">
            <span>約定タイミング</span>
            <strong>
              {tradingSettings.executionTiming === "same-close"
                ? "当日の終値"
                : "次の取引日の始値"}
            </strong>
          </div>

          {pendingOrders.length > 0 && (
            <div className="pending-order">
              <span>注文待機中 {pendingOrders.length}件</span>
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
                    取消
                  </button>
                </div>
              ))}
            </div>
          )}

          {orderMessage && <div className="order-message">{orderMessage}</div>}
        </section>

        <section className="trade-section chart-memo-section">
          <div className="section-heading-row">
            <h2>チャートメモ</h2>
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
              選択した日付に判断や気付きを記録します。
            </p>
            <div
              style={{
                padding: "8px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                backgroundColor: "var(--panel-muted)",
              }}
            >
              <span style={{ color: "var(--muted)" }}>対象日</span>
              <strong
                style={{
                  display: "block",
                  marginTop: "3px",
                  color: "var(--text)",
                }}
              >
                {paintTargetDate
                  ? formatDateWithWeekday(paintTargetDate)
                  : "ローソク足を選択"}
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
                ↑ 買い候補
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
                ↓ 売り候補
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
                メモ追加
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
                      削除
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
                      "この銘柄のチャートメモをすべて削除しますか？"
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
                この銘柄のメモを全削除
              </button>
            )}
          </div>
        </section>

        <div className="trade-panel-footer">
          <button type="button" onClick={() => setIsTradeLogOpen(true)}>
            売買ログ
            {currentBook.logs.length > 0 ? ` (${currentBook.logs.length})` : ""}
          </button>
          <button
            type="button"
            onClick={exportTradeLogCsv}
            disabled={currentBook.logs.length === 0}
            title={
              currentBook.logs.length === 0
                ? "約定履歴がないためCSV出力できません"
                : "売買ログをCSV出力します"
            }
          >
            CSV出力
          </button>
          <button
            type="button"
            className="reset-button"
            onClick={() => {
              if (window.confirm("この銘柄の建玉と売買ログを消去しますか？")) {
                resetTradingBook();
              }
            }}
          >
            練習をリセット
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
                <h2 style={{ margin: 0, fontSize: "20px" }}>設定</h2>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: "#94a3b8",
                    fontSize: "12px",
                  }}
                >
                  変更した設定はチャートへ反映されます。保存すると次回起動時も維持されます。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const savedSettings = loadChartSettingsFromStorage();
                  setMaDisplaySettings(savedSettings.maSettings);
                  setAppearanceSettings(savedSettings.appearanceSettings);
                  setTradingSettings(savedSettings.tradingSettings);
                  setIsAppearanceSettingsOpen(false);
                }}
                aria-label="外観設定を閉じる"
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
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                {(
                  [
                    { value: "ma", label: "移動平均線" },
                    { value: "appearance", label: "チャート外観" },
                    { value: "trading", label: "売買設定" },
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
                    <span>表示</span>
                    <span>期間</span>
                    <span>色</span>
                    <span>線の太さ</span>
                    <span>スタイル</span>
                    <span>見本</span>
                    <span>透明度</span>
                    <span>削除</span>
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
                        日
                      </label>
                      <input
                        type="color"
                        value={setting.color}
                        onChange={(event) =>
                          updateMaDisplaySetting(setting.id, {
                            color: event.target.value,
                          })
                        }
                        aria-label={`${setting.period}日の色`}
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
                          aria-label={`${setting.period}日の透明度`}
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
                        削除
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
                      ＋ 移動平均線を追加
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
                      線スタイル見本
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
                      プレビュー
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
                    <strong>約定タイミング</strong>
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
                            label: "次の取引日の始値",
                            description:
                              "今まで通りの動きです。注文した次の取引日の始値で約定します。",
                          },
                          {
                            value: "same-close",
                            label: "当日の終値",
                            description:
                              "表示中の日付の終値で約定します。終値ベースで素早く検証したい時に使います。",
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
                      color: "#94a3b8",
                      fontSize: "12px",
                      lineHeight: 1.7,
                    }}
                  >
                    変更後に入れる注文から反映されます。すでに注文済みの約定予定は、注文時の設定で処理されます。
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
                    <strong>背景テーマ</strong>
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
                              {chartThemeLabels[theme]}
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
                    <strong>グリッド表示</strong>
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
                      表示する
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
                    <strong>グリッドの濃さ</strong>
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
                                ? "薄い"
                                : size === "medium"
                                  ? "中"
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
                    <strong>配色プリセット</strong>
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
                              {preset.label}
                            </span>
                            <span style={{ color: "#cbd5e1", fontSize: "12px" }}>
                              {preset.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(
                    [
                      ["bullishColor", "陽線カラー（上昇）"],
                      ["bearishColor", "陰線カラー（下落）"],
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
                リセット
              </button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const savedSettings = loadChartSettingsFromStorage();
                    setMaDisplaySettings(savedSettings.maSettings);
                    setAppearanceSettings(savedSettings.appearanceSettings);
                    setTradingSettings(savedSettings.tradingSettings);
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
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveChartSettingsToStorage({
                      maSettings: maDisplaySettings,
                      appearanceSettings,
                      tradingSettings,
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
                  保存
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
            aria-label="売買ログ"
          >
            <div className="trade-log-header">
              <div>
                <h2>売買ログ</h2>
                <span>
                  {getStockInfoFromPath(selectedDataPath).code}{" "}
                  {getStockInfoFromPath(selectedDataPath).name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsTradeLogOpen(false)}
                aria-label="売買ログを閉じる"
              >
                ×
              </button>
            </div>

            {currentBook.logs.length === 0 ? (
              <div className="empty-trade-log">まだ約定履歴はありません</div>
            ) : (
              <div className="trade-log-list">
                {currentBook.logs.map((log) => (
                  <div className="trade-log-row" key={log.id}>
                    <div>
                      <strong>{orderActionLabel[log.action]}</strong>
                      <span>
                        {log.lots}玉・
                        {formatQuantity(
                          log.shares,
                          selectedInstrument.unitLabel
                        )}
                      </span>
                    </div>
                    <div>
                      <span>注文日</span>
                      <strong>{log.orderedDate}</strong>
                    </div>
                    <div>
                      <span>約定日</span>
                      <strong>{log.executionDate}</strong>
                    </div>
                    <div>
                      <span>約定価格</span>
                      <strong>
                        {formatCurrencyAmount(
                          log.executionPrice,
                          selectedInstrument.currency,
                          false
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>確定損益</span>
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
                  </div>
                ))}
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
          <span className="panel-open-label">売買練習</span>
        </button>
      )}
    </div>
  );
}
