import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {normalizeContact,validateContact} from "./pilot-contact";
it("retains the site's intake validation and streaming bounds verbatim",()=>{
 for(const [local,site] of [["pilot-contact","contact"],["pilot-bounded-json","bounded-json"]]) {
  expect(readFileSync(new URL(`./${local}.ts`,import.meta.url),"utf8")).toBe(readFileSync(new URL(`../../../site/src/lib/${site}.ts`,import.meta.url),"utf8"));
 }
});
it("normalizes trailing spaces but surfaces required and length errors",()=>{expect(normalizeContact({name:" Alice  "}).name).toBe("Alice");expect(validateContact({name:"a",email:"bad",company:"x".repeat(161)})).toHaveProperty("company");});
