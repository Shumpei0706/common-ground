// Synchronous statements stay inside the single Durable Object storage gate.
export function durableSqlite(storage){
 let revision=0;
 const query=(sql,args=[])=>storage.sql.exec(sql,...args);
 return {get revision(){return revision;},exec:sql=>{query(sql);},prepare:sql=>({all:(...args)=>[...query(sql,args)],get:(...args)=>[...query(sql,args)][0],run:(...args)=>{const cursor=query(sql,args);[...cursor];if(cursor.rowsWritten>0)revision++;return {changes:cursor.rowsWritten,lastInsertRowid:[...query('SELECT last_insert_rowid() AS id')][0].id};}}),transactionSync:fn=>storage.transactionSync(fn),close(){}};
}
