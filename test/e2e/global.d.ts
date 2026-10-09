import type { GameScreenDebug } from '../../src/app/game-screen';

declare global {
  interface Window {
    __newWorld?: GameScreenDebug;
  }
}
