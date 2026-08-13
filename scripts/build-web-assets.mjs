#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const sourceRoot=path.resolve(process.argv[2]||path.join(scriptDir,"../../toeic_listening_reading_banks"));
const outputRoot=path.resolve(process.argv[3]||path.join(scriptDir,"../public/assets"));
const catalogFile=path.join(scriptDir,"../public/data/catalog.json");
const catalog=JSON.parse(fs.readFileSync(catalogFile,"utf8"));
if(catalog.banks.length!==24)throw new Error("catalog 必须先包含24套题库");
fs.mkdirSync(outputRoot,{recursive:true});

const expected=new Set();
let copied=0,skipped=0,missing=0;
for(const bank of catalog.banks){
  const sourceDir=path.join(sourceRoot,`official_${bank.volume}`,`test_${bank.test}`);
  const index=JSON.parse(fs.readFileSync(path.join(scriptDir,"../public/data",bank.index_path),"utf8"));
  for(const assetKey of new Set(index.units.flatMap(unit=>unit.asset_refs||[]))){
    const prefix=`${bank.bank_id}/`,relative=assetKey.startsWith(prefix)?assetKey.slice(prefix.length):"";
    if(!relative)throw new Error(`无效 asset_key：${assetKey}`);
    const source=path.join(sourceDir,...relative.split("/")),target=path.join(outputRoot,bank.bank_id,...relative.split("/"));
    expected.add(path.resolve(target));
    if(!fs.existsSync(source)){missing++;continue}
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if(upToDate(source,target)){skipped++;continue}
    const ext=path.extname(source).toLowerCase();
    let command,args;
    if(ext===".mp3"){command="ffmpeg";args=["-hide_banner","-loglevel","error","-y","-i",source,"-vn","-ac","1","-ar","22050","-b:a","24k",target]}
    else if([".jpg",".jpeg",".png"].includes(ext)){command="ffmpeg";args=["-hide_banner","-loglevel","error","-y","-i",source,"-vf","scale=min\\(1000\\,iw\\):-2",...(ext===".png"?[]:["-q:v","6"]),target]}
    else {fs.copyFileSync(source,target);copied++;continue}
    const result=spawnSync(command,args,{stdio:"inherit"});if(result.status!==0)throw new Error(`资源压缩失败：${source}`);
    const time=fs.statSync(source).mtime;fs.utimesSync(target,time,time);copied++;
  }
}
for(const file of walk(outputRoot))if(!expected.has(path.resolve(file)))fs.rmSync(file);
if(missing)throw new Error(`缺少 ${missing} 个已引用资源`);
console.log(`Web assets ready: ${expected.size} files (${copied} built, ${skipped} reused) in ${outputRoot}`);

function upToDate(source,target){return fs.existsSync(target)&&fs.statSync(target).mtimeMs>=fs.statSync(source).mtimeMs}
function* walk(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())yield* walk(file);else yield file}}
