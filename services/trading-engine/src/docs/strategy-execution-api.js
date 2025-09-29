/**
 * @swagger
 * components:
 *   schemas:
 *     StrategyExecutionRequest:
 *       type: object
 *       required:
 *         - strategy
 *         - symbol
 *       properties:
 *         strategy:
 *           type: string
 *           description: Name of the strategy to execute
 *           example: "mean-reversion"
 *         symbol:
 *           type: string
 *           description: Trading pair symbol (e.g., BTC-USD, AAPL)
 *           example: "BTC-USD"
 *         timeframe:
 *           type: string
 *           enum: ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d", "1w"]
 *           default: "1d"
 *           description: Timeframe for the strategy
 *         parameters:
 *           type: object
 *           description: Strategy-specific parameters
 *           example: { lookbackPeriod: 14, threshold: 2.0 }
 *         riskParameters:
 *           type: object
 *           description: Risk management parameters
 *           properties:
 *             maxPositionSize:
 *               type: number
 *               minimum: 0.01
 *               maximum: 100
 *               example: 10
 *             maxDailyLoss:
 *               type: number
 *               minimum: 0.1
 *               maximum: 50
 *               example: 2
 *             maxDrawdown:
 *               type: number
 *               minimum: 0.1
 *               maximum: 100
 *               example: 5
 *             maxLeverage:
 *               type: number
 *               minimum: 1
 *               maximum: 100
 *               example: 5
 *         dryRun:
 *           type: boolean
 *           default: false
 *           description: If true, simulates execution without placing real orders
 *         callbackUrl:
 *           type: string
 *           format: uri
 *           description: Webhook URL to receive execution updates
 *           example: "https://example.com/api/webhooks/strategy-updates"
 *         metadata:
 *           type: object
 *           description: Additional metadata for the execution
 *
 *     StrategyExecutionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         executionId:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         status:
 *           type: string
 *           enum: ["pending", "running", "completed", "failed", "cancelled"]
 *           example: "pending"
 *         message:
 *           type: string
 *           example: "Strategy execution started"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2023-06-15T14:30:00Z"
 *
 *     ExecutionStatusResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         execution:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *               example: "123e4567-e89b-12d3-a456-426614174000"
 *             status:
 *               type: string
 *               enum: ["pending", "running", "completed", "failed", "cancelled"]
 *               example: "completed"
 *             strategy:
 *               type: string
 *               example: "mean-reversion"
 *             symbol:
 *               type: string
 *               example: "BTC-USD"
 *             timeframe:
 *               type: string
 *               example: "1d"
 *             startedAt:
 *               type: string
 *               format: date-time
 *               example: "2023-06-15T14:30:00Z"
 *             completedAt:
 *               type: string
 *               format: date-time
 *               example: "2023-06-15T14:31:23Z"
 *             duration:
 *               type: number
 *               description: Duration in milliseconds
 *               example: 83000
 *             result:
 *               type: object
 *               properties:
 *                 executed:
 *                   type: boolean
 *                   example: true
 *                 orderId:
 *                   type: string
 *                   example: "order_1234567890"
 *                 symbol:
 *                   type: string
 *                   example: "BTC-USD"
 *                 side:
 *                   type: string
 *                   enum: ["BUY", "SELL"]
 *                   example: "BUY"
 *                 quantity:
 *                   type: number
 *                   example: 0.5
 *                 price:
 *                   type: number
 *                   example: 30000.50
 *                 pnl:
 *                   type: number
 *                   example: 150.25
 *                 fees:
 *                   type: number
 *                   example: 4.50
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-06-15T14:31:23Z"
 *             error:
 *               type: object
 *               properties:
 *                 reason:
 *                   type: string
 *                   example: "Insufficient funds"
 *                 details:
 *                   type: object
 *                   example: { availableBalance: 1000, requiredBalance: 1500 }
 *                 code:
 *                   type: string
 *                   example: "INSUFFICIENT_FUNDS"
 *
 *     ExecutionHistoryResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ExecutionStatusResponse/properties/execution'
 *         pagination:
 *           type: object
 *           properties:
 *             limit:
 *               type: integer
 *               example: 50
 *             offset:
 *               type: integer
 *               example: 0
 *             total:
 *               type: integer
 *               example: 1
 *             hasMore:
 *               type: boolean
 *               example: false
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: "Execution not found"
 *         code:
 *           type: string
 *           example: "NOT_FOUND"
 *         details:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *                 example: "symbol"
 *               message:
 *                 type: string
 *                 example: "must be a valid trading pair"
 *               type:
 *                 type: string
 *                 example: "string.pattern.base"
 *
 *   parameters:
 *     executionIdPath:
 *       in: path
 *       name: executionId
 *       schema:
 *         type: string
 *         format: uuid
 *       required: true
 *       description: ID of the execution
 *       example: "123e4567-e89b-12d3-a456-426614174000"
 *
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * tags:
 *   - name: Strategy Execution
 *     description: API for executing and managing trading strategies
 */

/**
 * @swagger
 * /api/strategy/execute:
 *   post:
 *     summary: Execute a trading strategy
 *     description: Execute a trading strategy with the specified parameters
 *     tags: [Strategy Execution]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StrategyExecutionRequest'
 *     responses:
 *       202:
 *         description: Strategy execution started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StrategyExecutionResponse'
 *       400:
 *         description: Invalid input parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have permission
 *       500:
 *         description: Internal server error
 *
 * /api/strategy/status/{executionId}:
 *   get:
 *     summary: Get execution status
 *     description: Get the current status of a strategy execution
 *     tags: [Strategy Execution]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/executionIdPath'
 *     responses:
 *       200:
 *         description: Execution status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExecutionStatusResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have permission
 *       404:
 *         description: Execution not found
 *
 * /api/strategy/{executionId}/cancel:
 *   post:
 *     summary: Cancel execution
 *     description: Cancel a running strategy execution
 *     tags: [Strategy Execution]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/executionIdPath'
 *     responses:
 *       200:
 *         description: Execution cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Execution cancelled successfully"
 *       400:
 *         description: Cannot cancel execution (already completed or failed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have permission
 *       404:
 *         description: Execution not found
 *
 * /api/strategy/history:
 *   get:
 *     summary: Get execution history
 *     description: Get a paginated list of strategy executions for the authenticated user
 *     tags: [Strategy Execution]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 50
 *         description: Maximum number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip for pagination
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["pending", "running", "completed", "failed", "cancelled"]
 *         description: Filter by execution status
 *       - in: query
 *         name: strategy
 *         schema:
 *           type: string
 *         description: Filter by strategy name
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by trading pair symbol
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter executions started after this date (ISO 8601 format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter executions started before this date (ISO 8601 format)
 *     responses:
 *       200:
 *         description: Execution history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExecutionHistoryResponse'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 */

module.exports = {
  // This object is intentionally empty as this file is for Swagger documentation only
  // The actual API implementation is in strategyExecutionAPI.js
};
