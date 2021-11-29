import { padLeft } from "./utils";
import * as fs from "fs";

export interface Logger {
    debug(msg: string): void;
    info(msg: string): void;
    error(msg: string): void;

}
enum LogLevel {
    DEBUG = 1,
    INFO = 3,
    ERROR = 5
}

function getDateString(dt: Date) {
    return `${padLeft(dt.getUTCDate(), 2)}/${padLeft(dt.getUTCMonth(), 2)}/${padLeft(dt.getUTCFullYear(), 4)} ` +
        `${padLeft(dt.getUTCHours(), 2)}:${padLeft(dt.getUTCMinutes(), 2)}:${padLeft(dt.getUTCSeconds(), 2)}.${padLeft(dt.getUTCMilliseconds(), 2)}`
}
function getLogLine(msg: string, logLevel: LogLevel) {
    let dt = new Date();
    return `${getDateString(dt)} [${LogLevel[logLevel]}] - ${msg}`
}

export class ConsoleLogger implements Logger {
    private logLevel: LogLevel = LogLevel.DEBUG
    debug(msg: string): void {
        if (this.logLevel <= LogLevel.DEBUG)
            console.log(getLogLine(msg, LogLevel.DEBUG))
    }
    info(msg: string): void {
        if (this.logLevel <= LogLevel.INFO)
            console.log(getLogLine(msg, LogLevel.INFO))
    }
    error(msg: string): void {
        if (this.logLevel <= LogLevel.ERROR)
            console.log(getLogLine(msg, LogLevel.ERROR))
    }
}

export class FileLogger implements Logger {
    logLevel: LogLevel = LogLevel.DEBUG;
    filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath
    }

    debug(msg: string): void {
        if (this.logLevel <= LogLevel.DEBUG)
            this.writeToFile(getLogLine(msg, LogLevel.DEBUG))
    }
    info(msg: string): void {
        if (this.logLevel <= LogLevel.INFO)
            this.writeToFile(getLogLine(msg, LogLevel.INFO))
    }
    error(msg: string): void {
        if (this.logLevel <= LogLevel.ERROR)
            this.writeToFile(getLogLine(msg, LogLevel.ERROR))
    }

    private writeToFile(msg: string): void {
        fs.writeFileSync(this.filePath, msg, { flag: 'a+' })
    }
}

export class MultiLogger implements Logger {
    private loggers: Logger[]
    logLevel: LogLevel = LogLevel.DEBUG
    constructor(multipleLoggers: Logger[]) {
        this.loggers = multipleLoggers
    }

    debug(msg: string): void {
        for (const logger of this.loggers) {
            logger.debug(msg)
        }
    }
    info(msg: string): void {
        for (const logger of this.loggers) {
            logger.info(msg)
        }
    }
    error(msg: string): void {
        for (const logger of this.loggers) {
            logger.error(msg)
        }
    }
}