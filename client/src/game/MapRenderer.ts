import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { GameState } from '../../../shared/src/types.ts';

interface MapHighlights {
  claimableTileIds: Set<number>;
  selectedTileIds: Set<number>;
}

export class MapRenderer {
  public app: PIXI.Application;
  public viewport!: Viewport;
  
  private polyContainer!: PIXI.Container;
  private clickCallback?: (id: number) => void;
  private container: HTMLDivElement;
  private highlights: MapHighlights = {
    claimableTileIds: new Set(),
    selectedTileIds: new Set(),
  };

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.app = new PIXI.Application();
  }

  public async init() {
    await this.app.init({
      resizeTo: this.container,
      backgroundColor: 0x1A1A1A,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.container.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      worldWidth: 2000,
      worldHeight: 2000,
      events: this.app.renderer.events, 
    });

    this.app.stage.addChild(this.viewport);
    this.viewport.drag().pinch().wheel().decelerate();

    this.polyContainer = new PIXI.Container();
    this.viewport.addChild(this.polyContainer);
  }

  public setClickCallback(callback?: (id: number) => void) {
    this.clickCallback = callback;
  }

  public updateState(gameState: GameState, highlights: MapHighlights = this.highlights) {
    if (!this.polyContainer) return;
    this.highlights = highlights;
    
    this.polyContainer.removeChildren().forEach(child => child.destroy());

    Object.values(gameState.tiles).forEach((tile) => {
      const graphics = new PIXI.Graphics();
      const isSelected = highlights.selectedTileIds.has(tile.id);
      const isClaimable = highlights.claimableTileIds.has(tile.id);
      
      const drawPolygon = (isHovered: boolean) => {
        graphics.clear();
        
        let baseColor = gameState.tileTypes[tile.typeId]?.color || 0xFFFFFF;
        if (tile.ownerId !== null) {
          baseColor = gameState.players[tile.ownerId]?.color || baseColor;
        }

        const finalColor = isHovered || isClaimable ? this.lightenColor(baseColor, 30) : baseColor;

        graphics.poly(tile.points);
        graphics.fill(finalColor);
        
        if (isSelected) {
          graphics.stroke({ width: 5, color: 0xFFFFFF, alpha: 1 });
          graphics.zIndex = 2;
          return;
        }

        if (isClaimable) {
          graphics.stroke({ width: 4, color: 0xFFD700, alpha: 0.95 });
          graphics.zIndex = 1;
          return;
        }

        // Add a small indicator for cities if they are owned
        if (tile.typeId === 'city' && tile.ownerId !== null) {
          graphics.stroke({ width: 4, color: 0xFFFFFF, alpha: 0.8 });
          graphics.zIndex = 1; // Ensure cities are drawn above other tiles
        } else {
          graphics.stroke({ width: 2, color: 0x111111, alpha: 1 });
        }
      };

      drawPolygon(false);
      graphics.eventMode = 'static';
      graphics.cursor = 'pointer';

      graphics.on('pointerover', () => drawPolygon(true));
      graphics.on('pointerout', () => drawPolygon(false));

      let pointerDownPos = { x: 0, y: 0 };
      graphics.on('pointerdown', (e) => pointerDownPos = { x: e.global.x, y: e.global.y });
      graphics.on('pointerup', (e) => {
        const distance = Math.hypot(e.global.x - pointerDownPos.x, e.global.y - pointerDownPos.y);
        if (distance < 5) this.clickCallback?.(tile.id);
      });

      this.polyContainer.addChild(graphics);
    });
  }

  public destroy() {
    if (this.app.renderer) this.app.destroy({ removeView: true });
  }

  private lightenColor(color: number, percent: number): number {
    const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * (1 + percent / 100)));
    const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * (1 + percent / 100)));
    const b = Math.min(255, Math.floor((color & 0xff) * (1 + percent / 100)));
    return (r << 16) | (g << 8) | b;
  }
}
