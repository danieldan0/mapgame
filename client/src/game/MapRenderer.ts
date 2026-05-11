import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { PolygonData } from '../components/Map';

export class MapRenderer {
  public app: PIXI.Application;
  public viewport!: Viewport;
  
  private polyContainer!: PIXI.Container;
  private clickCallback?: (id: string) => void;
  private container: HTMLDivElement;

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

  public setClickCallback(callback?: (id: string) => void) {
    this.clickCallback = callback;
  }

  public updatePolygons(polygons: PolygonData[]) {
    if (!this.polyContainer) return;
    
    this.polyContainer.removeChildren().forEach(child => child.destroy());

    polygons.forEach((polyData) => {
      const graphics = new PIXI.Graphics();
      
      const drawPolygon = (isHovered: boolean) => {
        graphics.clear();
        const baseColor = polyData.ownerColor ?? polyData.terrainColor;
        const finalColor = isHovered ? this.lightenColor(baseColor, 30) : baseColor;

        graphics.poly(polyData.points);
        graphics.fill(finalColor);
        graphics.stroke({ width: 2, color: 0x111111, alpha: 1 });
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
        if (distance < 5) this.clickCallback?.(polyData.id);
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