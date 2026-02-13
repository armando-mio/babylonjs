/**
 * Test suite per il modulo logger
 */

export {}; // Ensure this file is treated as a module

// Reset module between tests
let logModule: typeof import('../src/logger');

beforeEach(() => {
  jest.resetModules();
  logModule = require('../src/logger');
});

describe('Logger', () => {
  test('log aggiunge entry al buffer', () => {
    logModule.log('INFO', 'test message');
    expect(logModule.logBuffer.length).toBe(1);
    expect(logModule.logBuffer[0].level).toBe('INFO');
    expect(logModule.logBuffer[0].msg).toBe('test message');
  });

  test('log formatta il timestamp correttamente (HH:MM:SS.mmm)', () => {
    logModule.log('INFO', 'timestamp test');
    const time = logModule.logBuffer[0].time;
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  test('log gestisce tutti i livelli: INFO, WARN, ERROR', () => {
    const consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };

    logModule.log('INFO', 'info msg');
    logModule.log('WARN', 'warn msg');
    logModule.log('ERROR', 'error msg');

    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[AR-APP'),
      'info msg',
    );
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining('[AR-APP'),
      'warn msg',
    );
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('[AR-APP'),
      'error msg',
    );

    Object.values(consoleSpy).forEach(s => s.mockRestore());
  });

  test('buffer non supera LOG_MAX (60) entry', () => {
    for (let i = 0; i < 70; i++) {
      logModule.log('INFO', `msg ${i}`);
    }
    expect(logModule.logBuffer.length).toBe(60);
    // First entry should be msg 10 (0-9 shifted out)
    expect(logModule.logBuffer[0].msg).toBe('msg 10');
    expect(logModule.logBuffer[59].msg).toBe('msg 69');
  });

  test('LogEntry ha la struttura corretta', () => {
    logModule.log('WARN', 'structure test');
    const entry = logModule.logBuffer[0];
    expect(entry).toHaveProperty('time');
    expect(entry).toHaveProperty('level');
    expect(entry).toHaveProperty('msg');
    expect(typeof entry.time).toBe('string');
    expect(typeof entry.level).toBe('string');
    expect(typeof entry.msg).toBe('string');
  });
});
