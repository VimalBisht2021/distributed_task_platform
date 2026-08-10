"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultExecutionClock = void 0;
class DefaultExecutionClock {
    now() {
        return new Date();
    }
}
exports.DefaultExecutionClock = DefaultExecutionClock;
