/**
 * Morton Z-order curve spatial index replacing the standard SpatialHashGrid.
 * Improves cache locality for 2D spatial queries.
 */
class MortonSpatialGrid {
  /**
   * Creates a new MortonSpatialGrid.
   * @param {number} width - World width.
   * @param {number} height - World height.
   * @param {number} [cellSize=8] - Size of each cell bucket.
   */
  constructor(width, height, cellSize = 8) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;

    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);

    // Calculate maximum Morton code needed
    const maxCol = Math.max(0, this.cols - 1);
    const maxRow = Math.max(0, this.rows - 1);
    const maxMorton = this._mortonEncode(maxCol, maxRow);
    
    // Find next power of 2 for table size to use masking
    let tableSize = 1;
    while (tableSize <= maxMorton) {
      tableSize <<= 1;
    }
    
    this.tableMask = tableSize - 1;

    // Use Int32Array for flat linked list data structures
    this.head = new Int32Array(tableSize).fill(-1);
    
    this.maxEntities = 4096;
    this.count = 0;

    this.next = new Int32Array(this.maxEntities).fill(-1);
    this.entityId = new Int32Array(this.maxEntities);
    this.entityX = new Float32Array(this.maxEntities);
    this.entityY = new Float32Array(this.maxEntities);
  }

  /**
   * Encodes a 2D coordinate into a Morton Z-order code.
   * @param {number} x - The x coordinate (column).
   * @param {number} y - The y coordinate (row).
   * @returns {number} The Morton code.
   * @private
   */
  _mortonEncode(x, y) {
    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;
    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;
    return (x | (y << 1)) >>> 0;
  }

  /**
   * Resets all entries in the grid.
   */
  clear() {
    this.head.fill(-1);
    this.count = 0;
  }

  /**
   * Inserts an entity into the grid.
   * @param {number} id - Entity ID.
   * @param {number} x - Entity x coordinate.
   * @param {number} y - Entity y coordinate.
   * @returns {boolean} True if inserted, false if grid is full.
   */
  insert(id, x, y) {
    if (this.count >= this.maxEntities) {
      return false;
    }

    let col = Math.floor(x / this.cellSize);
    let row = Math.floor(y / this.cellSize);
    
    // Clamp to grid bounds
    if (col < 0) col = 0;
    else if (col >= this.cols) col = this.cols - 1;
    
    if (row < 0) row = 0;
    else if (row >= this.rows) row = this.rows - 1;

    const morton = this._mortonEncode(col, row);
    const bucket = morton & this.tableMask;

    const idx = this.count++;

    this.entityId[idx] = id;
    this.entityX[idx] = x;
    this.entityY[idx] = y;
    
    this.next[idx] = this.head[bucket];
    this.head[bucket] = idx;

    return true;
  }

  /**
   * Finds all entities within a given radius.
   * @param {number} x - The center x coordinate.
   * @param {number} y - The center y coordinate.
   * @param {number} radius - The search radius.
   * @param {Array<number>} outIds - Array to store found entity IDs.
   * @returns {Array<number>} The updated outIds array.
   */
  queryRadius(x, y, radius, outIds) {
    outIds = outIds || (this._queryBuffer || (this._queryBuffer = []));
    outIds.length = 0;
    
    const r2 = radius * radius;
    
    let minCol = Math.floor((x - radius) / this.cellSize);
    let maxCol = Math.floor((x + radius) / this.cellSize);
    let minRow = Math.floor((y - radius) / this.cellSize);
    let maxRow = Math.floor((y + radius) / this.cellSize);

    // Clamp to grid bounds
    if (minCol < 0) minCol = 0;
    if (maxCol >= this.cols) maxCol = this.cols - 1;
    if (minRow < 0) minRow = 0;
    if (maxRow >= this.rows) maxRow = this.rows - 1;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const morton = this._mortonEncode(col, row);
        const bucket = morton & this.tableMask;
        
        let curr = this.head[bucket];
        while (curr !== -1) {
          const dx = this.entityX[curr] - x;
          const dy = this.entityY[curr] - y;
          const dist2 = dx * dx + dy * dy;
          
          if (dist2 <= r2) {
            outIds.push(this.entityId[curr]);
          }
          
          curr = this.next[curr];
        }
      }
    }
    
    return outIds;
  }
}

module.exports = { MortonSpatialGrid };
