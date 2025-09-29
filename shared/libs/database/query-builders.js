/**
 * Query Builders for NexusTradeAI
 * SQL query builders optimized for trading data
 */

class QueryBuilders {
  /**
   * Build SELECT query for trading data
   */
  static select(table) {
    return new SelectQueryBuilder(table);
  }

  /**
   * Build INSERT query for trading data
   */
  static insert(table) {
    return new InsertQueryBuilder(table);
  }

  /**
   * Build UPDATE query for trading data
   */
  static update(table) {
    return new UpdateQueryBuilder(table);
  }

  /**
   * Build DELETE query for trading data
   */
  static delete(table) {
    return new DeleteQueryBuilder(table);
  }
}

class SelectQueryBuilder {
  constructor(table) {
    this.table = table;
    this.selectFields = ['*'];
    this.whereConditions = [];
    this.joinClauses = [];
    this.orderByFields = [];
    this.groupByFields = [];
    this.havingConditions = [];
    this.limitValue = null;
    this.offsetValue = null;
    this.params = [];
  }

  select(fields) {
    if (Array.isArray(fields)) {
      this.selectFields = fields;
    } else if (typeof fields === 'string') {
      this.selectFields = [fields];
    }
    return this;
  }

  where(condition, value = null) {
    if (value !== null) {
      this.whereConditions.push(`${condition} = $${this.params.length + 1}`);
      this.params.push(value);
    } else {
      this.whereConditions.push(condition);
    }
    return this;
  }

  whereIn(field, values) {
    const placeholders = values.map((_, index) => `$${this.params.length + index + 1}`).join(', ');
    this.whereConditions.push(`${field} IN (${placeholders})`);
    this.params.push(...values);
    return this;
  }

  whereBetween(field, start, end) {
    this.whereConditions.push(`${field} BETWEEN $${this.params.length + 1} AND $${this.params.length + 2}`);
    this.params.push(start, end);
    return this;
  }

  whereDate(field, operator, date) {
    this.whereConditions.push(`DATE(${field}) ${operator} $${this.params.length + 1}`);
    this.params.push(date);
    return this;
  }

  join(table, condition) {
    this.joinClauses.push(`INNER JOIN ${table} ON ${condition}`);
    return this;
  }

  leftJoin(table, condition) {
    this.joinClauses.push(`LEFT JOIN ${table} ON ${condition}`);
    return this;
  }

  rightJoin(table, condition) {
    this.joinClauses.push(`RIGHT JOIN ${table} ON ${condition}`);
    return this;
  }

  orderBy(field, direction = 'ASC') {
    this.orderByFields.push(`${field} ${direction.toUpperCase()}`);
    return this;
  }

  groupBy(fields) {
    if (Array.isArray(fields)) {
      this.groupByFields.push(...fields);
    } else {
      this.groupByFields.push(fields);
    }
    return this;
  }

  having(condition) {
    this.havingConditions.push(condition);
    return this;
  }

  limit(count) {
    this.limitValue = count;
    return this;
  }

  offset(count) {
    this.offsetValue = count;
    return this;
  }

  build() {
    let query = `SELECT ${this.selectFields.join(', ')} FROM ${this.table}`;

    if (this.joinClauses.length > 0) {
      query += ` ${this.joinClauses.join(' ')}`;
    }

    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    if (this.groupByFields.length > 0) {
      query += ` GROUP BY ${this.groupByFields.join(', ')}`;
    }

    if (this.havingConditions.length > 0) {
      query += ` HAVING ${this.havingConditions.join(' AND ')}`;
    }

    if (this.orderByFields.length > 0) {
      query += ` ORDER BY ${this.orderByFields.join(', ')}`;
    }

    if (this.limitValue !== null) {
      query += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== null) {
      query += ` OFFSET ${this.offsetValue}`;
    }

    return {
      query: query,
      params: this.params
    };
  }
}

class InsertQueryBuilder {
  constructor(table) {
    this.table = table;
    this.insertData = {};
    this.onConflictAction = null;
    this.returningFields = [];
  }

  values(data) {
    this.insertData = { ...this.insertData, ...data };
    return this;
  }

  onConflict(action) {
    this.onConflictAction = action;
    return this;
  }

  returning(fields) {
    if (Array.isArray(fields)) {
      this.returningFields = fields;
    } else {
      this.returningFields = [fields];
    }
    return this;
  }

  build() {
    const fields = Object.keys(this.insertData);
    const values = Object.values(this.insertData);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    let query = `INSERT INTO ${this.table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;

    if (this.onConflictAction) {
      query += ` ${this.onConflictAction}`;
    }

    if (this.returningFields.length > 0) {
      query += ` RETURNING ${this.returningFields.join(', ')}`;
    }

    return {
      query: query,
      params: values
    };
  }
}

class UpdateQueryBuilder {
  constructor(table) {
    this.table = table;
    this.updateData = {};
    this.whereConditions = [];
    this.returningFields = [];
    this.params = [];
  }

  set(data) {
    this.updateData = { ...this.updateData, ...data };
    return this;
  }

  where(condition, value = null) {
    if (value !== null) {
      this.whereConditions.push(`${condition} = $${Object.keys(this.updateData).length + this.params.length + 1}`);
      this.params.push(value);
    } else {
      this.whereConditions.push(condition);
    }
    return this;
  }

  returning(fields) {
    if (Array.isArray(fields)) {
      this.returningFields = fields;
    } else {
      this.returningFields = [fields];
    }
    return this;
  }

  build() {
    const fields = Object.keys(this.updateData);
    const values = Object.values(this.updateData);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    let query = `UPDATE ${this.table} SET ${setClause}`;

    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    if (this.returningFields.length > 0) {
      query += ` RETURNING ${this.returningFields.join(', ')}`;
    }

    return {
      query: query,
      params: [...values, ...this.params]
    };
  }
}

class DeleteQueryBuilder {
  constructor(table) {
    this.table = table;
    this.whereConditions = [];
    this.returningFields = [];
    this.params = [];
  }

  where(condition, value = null) {
    if (value !== null) {
      this.whereConditions.push(`${condition} = $${this.params.length + 1}`);
      this.params.push(value);
    } else {
      this.whereConditions.push(condition);
    }
    return this;
  }

  returning(fields) {
    if (Array.isArray(fields)) {
      this.returningFields = fields;
    } else {
      this.returningFields = [fields];
    }
    return this;
  }

  build() {
    let query = `DELETE FROM ${this.table}`;

    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    if (this.returningFields.length > 0) {
      query += ` RETURNING ${this.returningFields.join(', ')}`;
    }

    return {
      query: query,
      params: this.params
    };
  }
}

module.exports = QueryBuilders;