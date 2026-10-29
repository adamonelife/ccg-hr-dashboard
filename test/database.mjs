import { PGlite } from '@electric-sql/pglite';
// Actual PostgreSQL SQL/constraints/rollback in memory, with no network or credentials.
export const database = new PGlite();
export const queries = [];
let fault = null;
export function failNext(pattern) { fault = pattern; }
class Fragment {
  constructor(strings, values, execute) { Object.assign(this, { strings, values, execute }); }
  then(resolve, reject) { const params = []; return this.execute(compile(this, params), params).then(resolve, reject); }
}
class Builder { constructor(value) { this.value = value; } }
const quote = s => '"' + s.replaceAll('"', '""') + '"';
function compile(fragment, params) {
  let text = fragment.strings[0];
  fragment.values.forEach((value, index) => {
    if (value instanceof Fragment) text += compile(value, params);
    else if (value instanceof Builder) {
      const entries = Object.entries(value.value);
      if (/insert\s+into\s+\w+\s*$/i.test(text)) {
        text += '(' + entries.map(([k]) => quote(k)).join(',') + ') VALUES (' + entries.map(([, v]) => { params.push(v); return '$' + params.length; }).join(',') + ')';
      } else text += entries.map(([k, v]) => { params.push(v); return quote(k) + '=$' + params.length; }).join(',');
    } else { params.push(value); text += '$' + params.length; }
    text += fragment.strings[index + 1];
  });
  return text;
}
function connection(executor) {
  const execute = async (text, params) => {
    queries.push(text);
    if (fault?.test(text)) { fault = null; throw new Error('Injected test failure'); }
    return (await executor.query(text, params)).rows;
  };
  function sql(strings, ...values) {
    if (!strings?.raw) return new Builder(strings);
    return new Fragment(strings, values, execute);
  }
  sql.begin = callback => database.transaction(tx => callback(connection(tx)));
  sql.end = () => database.close();
  return sql;
}
export const sql = connection(database);
