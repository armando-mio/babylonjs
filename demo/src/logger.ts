// ================= LOGGER =================
const LOG_MAX = 60;

export type LogEntry = {time: string; level: 'INFO' | 'WARN' | 'ERROR'; msg: string};
export const logBuffer: LogEntry[] = [];

export function log(level: LogEntry['level'], msg: string) {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`;
  const entry: LogEntry = {time, level, msg};
  logBuffer.push(entry);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();

  const prefix = `[AR-APP ${time}]`;
  if (level === 'ERROR') console.error(prefix, msg);
  else if (level === 'WARN') console.warn(prefix, msg);
  else console.log(prefix, msg);
}
