import Papa from "papaparse";
import type { Candle } from "../types";

type CsvCandleRow = {
  Date?: string;
  Open?: string | number;
  High?: string | number;
  Low?: string | number;
  Close?: string | number;
};

export function parseDailyCandles(csvText: string): Candle[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return (result.data as CsvCandleRow[])
    .map((row) => ({
      time: row.Date?.substring(0, 10),
      open: Number(row.Open),
      high: Number(row.High),
      low: Number(row.Low),
      close: Number(row.Close),
    }))
    .filter(
      (candle): candle is Candle =>
        Boolean(candle.time) &&
        !Number.isNaN(candle.open) &&
        !Number.isNaN(candle.high) &&
        !Number.isNaN(candle.low) &&
        !Number.isNaN(candle.close)
    );
}
