import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {ScopedReportQueue} from "./ScopedReportQueue";
import type {StoreData} from "@/lib/types";
it("never substitutes mutable source text for an original snapshot quote",()=>{
 const store={tenant:{id:"a"},conversations:[],messages:[{id:"m1",conversationId:"c1",content:"changed text"}],signals:[{id:"s1",conversationId:"c1",type:"retention",summary:"Inspect",evidenceStatus:"valid",evidenceSpans:[{messageId:"m1",start:0,end:5,quote:"close"}]}]} as unknown as StoreData;
 const html=renderToStaticMarkup(React.createElement(ScopedReportQueue,{store,query:"uploadId=u1&scoreTo=2026-10-04",preview:"s1"}));
 expect(html).not.toContain("changed text");expect(html).not.toContain("<blockquote");expect(html).toContain("Source anchor unavailable");expect(html).toContain("uploadId=u1&amp;scoreTo=2026-10-04");expect(html).not.toContain("<button");
});
it("paginates bounded snapshot inspection and announces its URL state",()=>{
 const store={tenant:{id:"a"},signals:Array.from({length:25},(_,i)=>({id:`s${i}`,type:"lead",summary:`Signal ${i}`})),messages:[],conversations:[]} as unknown as StoreData;
 const html=renderToStaticMarkup(React.createElement(ScopedReportQueue,{store,query:"uploadId=u1&scoreTo=2026-10-04",page:2}));
 expect(html).toContain("Page 2 of 3");expect(html).toContain('aria-live="polite"');expect(html).toContain("preview=s10");expect(html).not.toContain("preview=s0&amp;");expect(html).toContain("page=3");
});
