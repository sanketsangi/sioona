import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {PilotChecklist} from "./PilotChecklist";
it("shows persisted steps, scoped review links and browser-only PDF status",()=>{
 const html=renderToStaticMarkup(React.createElement(PilotChecklist,{conversations:12,reviewed:2,outcomes:0,query:"uploadId=u1&scoreFrom=2026-10-01&scoreTo=2026-10-04",pdfKey:"a".repeat(64),label:"Simulated fixture"}));
 expect(html).toContain("Evidence review");expect(html).toContain("2 persisted reviews");expect(html).toContain("uploadId=u1&amp;scoreFrom=2026-10-01&amp;scoreTo=2026-10-04");expect(html).toContain("remembered only in this browser");expect(html).toContain("Prepare executive PDF");
});
