from pymongo import MongoClient
from pymongo import IndexModel, ASCENDING
from bson.json_util import loads

# Connect to MongoDB
client = MongoClient('mongodb://localhost:27017/')
db = client['nexus_trade_db']

# Enable sharding for the database
# Note: Sharding is typically done via the MongoDB shell or admin tools, not directly via pymongo.
# This line is commented out because it requires admin access and specific MongoDB configurations.
# db.command("enableSharding", "nexus_trade_db")

# =====================================================
# USER PREFERENCES AND SETTINGS
# =====================================================

# User preferences collection
user_preferences_schema = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["user_id", "preferences", "created_at"],
        "properties": {
            "user_id": {
                "bsonType": "string",
                "description": "User ID from PostgreSQL"
            },
            "preferences": {
                "bsonType": "object",
                "properties": {
                    "theme": {"bsonType": "string", "enum": ["light", "dark", "auto"]},
                    "language": {"bsonType": "string"},
                    "timezone": {"bsonType": "string"},
                    "notifications": {
                        "bsonType": "object",
                        "properties": {
                            "email": {"bsonType": "bool"},
                            "push": {"bsonType": "bool"},
                            "sms": {"bsonType": "bool"},
                            "in_app": {"bsonType": "bool"}
                        }
                    },
                    "trading": {
                        "bsonType": "object",
                        "properties": {
                            "default_order_type": {"bsonType": "string"},
                            "default_time_in_force": {"bsonType": "string"},
                            "confirmation_required": {"bsonType": "bool"},
                            "advanced_features": {"bsonType": "bool"}
                        }
                    },
                    "display": {
                        "bsonType": "object",
                        "properties": {
                            "decimal_places": {"bsonType": "int"},
                            "currency_format": {"bsonType": "string"},
                            "chart_style": {"bsonType": "string"},
                            "watchlist_columns": {"bsonType": "array"}
                        }
                    }
                }
            },
            "created_at": {"bsonType": "date"},
            "updated_at": {"bsonType": "date"}
        }
    }
}

db.create_collection("user_preferences", validator=user_preferences_schema)
db.user_preferences.create_indexes([
    IndexModel([("user_id", ASCENDING)], unique=True),
    IndexModel([("updated_at", ASCENDING)])
])

# =====================================================
# WATCHLISTS AND PORTFOLIOS
# =====================================================

# User watchlists
watchlists_schema = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["user_id", "name", "symbols", "created_at"],
        "properties": {
            "user_id": {"bsonType": "string"},
            "name": {"bsonType": "string"},
            "description": {"bsonType": "string"},
            "symbols": {
                "bsonType": "array",
                "items": {
                    "bsonType": "object",
                    "properties": {
                        "symbol": {"bsonType": "string"},
                        "added_at": {"bsonType": "date"},
                        "notes": {"bsonType": "string"},
                        "target_price": {"bsonType": "double"},
                        "stop_loss": {"bsonType": "double"}
                    }
                }
            },
            "is_public": {"bsonType": "bool"},
            "tags": {"bsonType": "array", "items": {"bsonType": "string"}},
            "created_at": {"bsonType": "date"},
            "updated_at": {"bsonType": "date"}
        }
    }
}

db.create_collection("watchlists", validator=watchlists_schema)
db.watchlists.create_indexes([
    IndexModel([("user_id", ASCENDING)]),
    IndexModel([("user_id", ASCENDING), ("name", ASCENDING)], unique=True),
    IndexModel([("symbols.symbol", ASCENDING)]),
    IndexModel([("tags", ASCENDING)]),
    IndexModel([("is_public", ASCENDING)])
])

# Custom portfolio templates
portfolio_templates_schema = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["user_id", "name", "allocations", "created_at"],
        "properties": {
            "user_id": {"bsonType": "string"},
            "name": {"bsonType": "string"},
            "description": {"bsonType": "string"},
            "allocations": {
                "bsonType": "array",
                "items": {
                    "bsonType": "object",
                    "properties": {
                        "symbol": {"bsonType": "string"},
                        "target_percentage": {"bsonType": "double"},
                        "min_percentage": {"bsonType": "double"},
                        "max_percentage": {"bsonType": "double"},
                        "rebalance_threshold": {"bsonType": "double"}
                    }
                }
            },
            "risk_level": {"bsonType": "string", "enum": ["conservative", "moderate", "aggressive"]},
            "rebalance_frequency": {"bsonType": "string"},
            "total_allocation": {"bsonType": "double"},
            "is_public": {"bsonType": "bool"},
            "created_at": {"bsonType": "date"},
            "updated_at": {"bsonType": "date"}
        }
    }
}

db.create_collection("portfolio_templates", validator=portfolio_templates_schema)
db.portfolio_templates.create_indexes([
    IndexModel([("user_id", ASCENDING)]),
    IndexModel([("risk_level", ASCENDING)]),
    IndexModel([("is_public", ASCENDING)])
])

# =====================================================
# TRADING STRATEGIES AND ALGORITHMS
# =====================================================

# User-defined trading strategies
trading_strategies_schema = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["user_id", "name", "strategy_type", "parameters", "created_at"],
        "properties": {
            "user_id": {"bsonType": "string"},
            "name": {"bsonType": "string"},
            "description": {"bsonType": "string"},
            "strategy_type": {
                "bsonType": "string",
                "enum": ["technical", "fundamental", "quantitative", "ml_based", "custom"]
            },
            "parameters": {
                "bsonType": "object",
                "properties": {
                    "entry_conditions": {"bsonType": "object"},
                    "exit_conditions": {"bsonType": "object"},
                    "risk_management": {"bsonType": "object"},
                    "position_sizing": {"bsonType": "object"},
                    "timeframe": {"bsonType": "string"},
                    "max_positions": {"bsonType": "int"},
                    "stop_loss_pct": {"bsonType": "double"},
                    "take_profit_pct": {"bsonType": "double"}
                }
            },
            "code": {"bsonType": "string"},
            "is_active": {"bsonType": "bool"},
            "backtested": {"bsonType": "bool"},
            "backtest_results": {
                "bsonType": "object",
                "properties": {
                    "total_return": {"bsonType": "double"},
                    "sharpe_ratio": {"bsonType": "double"},
                    "max_drawdown": {"bsonType": "double"},
                    "win_rate": {"bsonType": "double"},
                    "profit_factor": {"bsonType": "double"},
                    "total_trades": {"bsonType": "int"}
                }
            },
            "paper_trading": {"bsonType": "bool"},
            "live_trading": {"bsonType": "bool"},
            "created_at": {"bsonType": "date"},
            "updated_at": {"bsonType": "date"}
        }
    }
}

db.create_collection("trading_strategies", validator=trading_strategies_schema)
db.trading_strategies.create_indexes([
    IndexModel([("user_id", ASCENDING)]),
    IndexModel([("strategy_type", ASCENDING)]),
    IndexModel([("is_active", ASCENDING)]),
    IndexModel([("created_at", ASCENDING)])
])

# Algorithm execution logs
algorithm_logs_schema = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["strategy_id", "user_id", "timestamp", "action"],
        "properties": {
            "strategy_id": {"bsonType": "objectId"},
            "user_id": {"bsonType": "string"},
            "timestamp": {"bsonType": "date"},
            "action": {
                "bsonType": "string",
                "enum": ["started", "stopped", "order_placed", "order_filled", "error", "warning"]
            },
            "symbol": {"bsonType": "string"},
            "details": {"bsonType": "object"},
            "message": {"bsonType": "string"},
            "severity": {"bsonType": "string", "enum": ["info", "warning", "error"]},
            "created_at": {"bsonType": "date"}
        }
    }
}

db.create_collection("algorithm_logs", validator=algorithm_logs_schema)
db.algorithm_logs.create_indexes([
    IndexModel([("strategy_id", ASCENDING)]),
    IndexModel([("user_id", ASCENDING)]),
    IndexModel([("timestamp", ASCENDING)]),
    IndexModel([("action", ASCENDING)])
])