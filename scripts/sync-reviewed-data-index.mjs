import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

// Refresh indexes from the current canonical details. This deliberately does
// not rebuild details from old OCR/enrichment files, which would undo reviews.
const root=fileURLToPath(new URL("../public/data",import.meta.url));
const catalogFile=path.join(root,"catalog.json");
const catalog=JSON.parse(fs.readFileSync(catalogFile,"utf8"));
const sha=value=>createHash("sha256").update(value).digest("hex");
const allHashes=[];
let changed=0;
for(const bank of catalog.banks){
  const file=path.join(root,bank.index_path),index=JSON.parse(fs.readFileSync(file,"utf8"));
  const before=JSON.stringify(index),hashes=[];
  for(const row of index.units){
    const detailFile=path.join(root,row.detail_path),raw=fs.readFileSync(detailFile,"utf8"),detail=JSON.parse(raw);
    if(detail.bank_id!==bank.bank_id||detail.unit_id!==row.unit_id)throw new Error(`Identity mismatch: ${row.detail_path}`);
    row.item_refs=detail.items.map(({item_id,item_key,question_type})=>({item_id,item_key,question_type}));
    row.asset_refs=[...new Set([...(row.asset_refs||[]),...detail.items.flatMap(item=>(item.source_images||[]).map(image=>image.asset_key||`${bank.bank_id}/${image.path}`))])];
    hashes.push(sha(raw));
  }
  index.content_hash=sha(JSON.stringify([index.units,hashes]));
  allHashes.push(index.content_hash);
  if(before!==JSON.stringify(index)){fs.writeFileSync(file,JSON.stringify(index,null,2)+"\n");changed++}
}
catalog.content_version=`reviewed-${sha(allHashes.join("\n")).slice(0,16)}`;
fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+"\n");
console.log(JSON.stringify({changed_indexes:changed,content_version:catalog.content_version}));
