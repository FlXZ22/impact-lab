import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cleanPhoto } from '../lib/image.js';

test('photo path resizes real images and strips metadata before Claude', async()=>{
 const original=await sharp({create:{width:2200,height:1700,channels:3,background:'#888'}}).withMetadata().jpeg().toBuffer();
 assert.ok((await sharp(original).metadata()).exif);
 const cleaned=await cleanPhoto({media_type:'image/jpeg',data:original.toString('base64')});
 const metadata=await sharp(Buffer.from(cleaned.data,'base64')).metadata();
 assert.equal(cleaned.media_type,'image/jpeg');assert.equal(metadata.width,1600);assert.ok(metadata.height<=1600);assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
});
test('fake MIME types and oversized photos are rejected',async()=>{
 await assert.rejects(()=>cleanPhoto({media_type:'image/png',data:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString('base64')}),{code:'INVALID_IMAGE'});
 await assert.rejects(()=>cleanPhoto({media_type:'image/png',data:Buffer.alloc(4*1024*1024+1).toString('base64')}),{code:'IMAGE_TOO_LARGE'});
});
