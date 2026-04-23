"use client";

import JSZip from "jszip";
import { renderPlaintextFromRichText, type Editor, type TLShape } from "tldraw";
import type { AnimationRegionData } from "@/components/animation/AnimationRegion";
import {
  TL_COLOR_HEX,
  resolveShapeColors,
} from "@/components/canvas/shapes/DirectoorShapes";

/**
 * Native .pptx export (Option 2): one slide with click-triggered entrance
 * animations on real PowerPoint shapes.
 *
 * Design goals (per user request):
 *   • Shape sizes are preserved exactly — each shape's width/height in
 *     pixels is converted 1:1 to EMU at the standard 96 dpi factor
 *     (1 px = 9525 EMU). Opening the deck in PowerPoint shows a
 *     cylinder/pill/diamond of the same on-screen size as on canvas.
 *   • Animation space coverage is preserved exactly — the slide
 *     dimensions are set to the animation REGION's bounding box, and
 *     every shape is positioned at (pageX - region.x, pageY - region.y)
 *     within the slide. Same relative layout, no squeeze or stretch.
 *   • Arrow-key / click driven reveals — each shape in the animation
 *     sequence gets a `clickEffect` entrance animation. In Slide Show
 *     mode, pressing → reveals the next shape, mirroring our canvas
 *     stepForward behaviour exactly. Auto-advance can be toggled from
 *     PowerPoint's own animation pane if the user wants it.
 *
 * Implementation note: PowerPoint (OOXML) is strict about its zip
 * contents. We generate only the bare-minimum set of parts required for
 * a valid single-slide deck, then inject our custom slide1.xml with
 * shapes + <p:timing>. Animation timing is documented in the ECMA-376
 * spec — the XML fragments below follow that schema.
 */

// ─── EMU constants ──────────────────────────────────────────────
// EMU = English Metric Unit. PowerPoint uses these everywhere.
// 914,400 EMU = 1 inch. At 96 DPI (browser default), 1 px = 9525 EMU.
const PX_TO_EMU = 9525;
// PowerPoint slide max is 51,206,400 EMU (56 inches). We cap slightly
// below that so very wide regions still fit.
const MAX_SLIDE_EMU = 45_720_000;

export interface PPTXExportOptions {
  onProgress?: (frac: number) => void;
}

interface RegionBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function computeRegionBounds(editor: Editor, region: AnimationRegionData): RegionBounds | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of region.shapeIds) {
    const b = editor.getShapePageBounds(id);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ─── Directoor shape type → PPT prstGeom preset ────────────────
// PPT has built-in preset geometries that cover most of our shapes.
// For types without a perfect match (stack/layer/actor) we fall back
// to "rect" so the label + bounds are preserved even if the visual
// is simplified. A future iteration can use <a:custGeom> for pixel-
// perfect versions.
const DIRECTOOR_TO_PRESET: Record<string, string> = {
  "directoor-rectangle": "rect",
  "directoor-circle": "ellipse",
  "directoor-diamond": "diamond",
  "directoor-cylinder": "can",
  "directoor-hexagon": "hexagon",
  "directoor-cloud": "cloud",
  "directoor-document": "flowChartDocument",
  "directoor-pill": "roundRect",
  "directoor-stack": "rect",
  "directoor-layer": "rect",
  "directoor-actor": "rect",
};

// ─── Style enum → PPT attribute mapping ───────────────────────
const ALIGN_MAP: Record<string, string> = {
  start: "l",
  middle: "ctr",
  end: "r",
  "start-legacy": "l",
  "middle-legacy": "ctr",
  "end-legacy": "r",
};
const VALIGN_MAP: Record<string, string> = {
  start: "t",
  middle: "ctr",
  end: "b",
};
const FONT_MAP: Record<string, string> = {
  draw: "Comic Sans MS",
  sans: "Calibri",
  serif: "Cambria",
  mono: "Courier New",
};
// Shape label sizes in canvas px; convert to PPT hundredths-of-a-point.
// PPT font sizes in <a:rPr sz="..."/> are in 100ths of a point.
// px → pt: divide by 1.333 (96 DPI). 18px ≈ 13.5pt → 1350.
const FONT_SIZE_MAP: Record<string, number> = {
  s: 1350,
  m: 1800,
  l: 2700,
  xl: 3600,
};

// Line dash presets
const DASH_MAP: Record<string, string> = {
  solid: "solid",
  dashed: "dash",
  dotted: "dot",
  draw: "solid", // tldraw's "sketchy" doesn't have a PPT equivalent; solid is closest.
};

// ─── XML helpers ──────────────────────────────────────────────
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hex(value: string): string {
  // Accepts "#AABBCC" or "AABBCC"; returns "AABBCC" upper-cased.
  return value.replace(/^#/, "").toUpperCase();
}

// ─── Shape XML builders ───────────────────────────────────────

/** Build the <p:sp> fragment for one Directoor geo shape. */
function buildGeoShapeXml(
  editor: Editor,
  shape: TLShape,
  spid: number,
  emuX: number,
  emuY: number,
  emuW: number,
  emuH: number,
): string {
  const type = shape.type;
  const prst = DIRECTOOR_TO_PRESET[type] ?? "rect";
  const props = shape.props as {
    color?: string;
    fill?: string;
    dash?: string;
    font?: string;
    size?: string;
    align?: string;
    verticalAlign?: string;
    labelColor?: string;
    richText?: unknown;
  };

  const { stroke, fill } = resolveShapeColors(
    (props.color as never) ?? "grey",
    (props.fill as never) ?? "none",
  );
  const fillIsTransparent = fill === "transparent" || fill.startsWith("#") === false;
  const strokeHex = hex(stroke);
  const dashKind = DASH_MAP[props.dash ?? "solid"] ?? "solid";

  // Extract plaintext label from richText.
  let labelText = "";
  try {
    if (props.richText) labelText = renderPlaintextFromRichText(editor, props.richText as never);
  } catch {
    labelText = "";
  }

  const labelColor = props.labelColor ?? "black";
  const labelHex = hex(TL_COLOR_HEX[labelColor as keyof typeof TL_COLOR_HEX] ?? "#0F172A");
  const fontFace = FONT_MAP[props.font ?? "sans"] ?? "Calibri";
  const fontSize = FONT_SIZE_MAP[props.size ?? "m"] ?? 1800;
  const algn = ALIGN_MAP[props.align ?? "middle"] ?? "ctr";
  const anchor = VALIGN_MAP[props.verticalAlign ?? "middle"] ?? "ctr";

  // roundRect needs an adjust value to look like a pill — 50% corner radius.
  const avList = prst === "roundRect" ? `<a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst>` : `<a:avLst/>`;

  const fillXml = fillIsTransparent
    ? `<a:noFill/>`
    : `<a:solidFill><a:srgbClr val="${hex(fill)}"/></a:solidFill>`;

  const txBody =
    labelText.trim().length === 0
      ? `<p:txBody><a:bodyPr anchor="${anchor}" wrap="square" rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>`
      : `<p:txBody>
          <a:bodyPr anchor="${anchor}" wrap="square" rtlCol="0"/>
          <a:lstStyle/>
          ${labelText
            .split(/\r?\n/)
            .map(
              (line) => `<a:p><a:pPr algn="${algn}"/>${
                line.length === 0
                  ? `<a:endParaRPr lang="en-US"/>`
                  : `<a:r><a:rPr lang="en-US" sz="${fontSize}" dirty="0"><a:solidFill><a:srgbClr val="${labelHex}"/></a:solidFill><a:latin typeface="${escapeXml(fontFace)}"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r>`
              }</a:p>`,
            )
            .join("")}
        </p:txBody>`;

  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${spid}" name="${escapeXml(type)} ${spid}"/>
      <p:cNvSpPr/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="${emuX}" y="${emuY}"/>
        <a:ext cx="${Math.max(1, emuW)}" cy="${Math.max(1, emuH)}"/>
      </a:xfrm>
      <a:prstGeom prst="${prst}">${avList}</a:prstGeom>
      ${fillXml}
      <a:ln w="19050"><a:solidFill><a:srgbClr val="${strokeHex}"/></a:solidFill><a:prstDash val="${dashKind}"/></a:ln>
    </p:spPr>
    ${txBody}
  </p:sp>`;
}

/** Build the <p:cxnSp> fragment for a directoor-arrow (line + optional arrowheads). */
function buildArrowXml(
  editor: Editor,
  shape: TLShape,
  spid: number,
  regionX: number,
  regionY: number,
): string {
  const props = shape.props as {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: string;
    strokeWidth?: number;
    dash?: string;
    startHead?: "none" | "arrow";
    endHead?: "none" | "arrow";
    path?: "straight" | "elbow";
    label?: string;
  };

  // Bounding box of the arrow relative to region.
  const x1 = props.startX - regionX;
  const y1 = props.startY - regionY;
  const x2 = props.endX - regionX;
  const y2 = props.endY - regionY;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2);
  const maxY = Math.max(y1, y2);

  const emuX = Math.round(minX * PX_TO_EMU);
  const emuY = Math.round(minY * PX_TO_EMU);
  const emuW = Math.max(1, Math.round((maxX - minX) * PX_TO_EMU));
  const emuH = Math.max(1, Math.round((maxY - minY) * PX_TO_EMU));

  // flip flags tell PPT if the connector runs right→left or bottom→top.
  const flipH = x1 > x2 ? ' flipH="1"' : "";
  const flipV = y1 > y2 ? ' flipV="1"' : "";

  const prst = props.path === "elbow" ? "bentConnector3" : "straightConnector1";
  const strokeHex = hex(TL_COLOR_HEX[props.color as keyof typeof TL_COLOR_HEX] ?? "#334155");
  const strokeWidth = Math.max(6350, Math.round((props.strokeWidth ?? 2) * 9525));
  const dashKind = DASH_MAP[props.dash ?? "solid"] ?? "solid";
  const headEnd = props.endHead === "arrow" ? `<a:tailEnd type="triangle" w="med" len="med"/>` : "";
  const headStart = props.startHead === "arrow" ? `<a:headEnd type="triangle" w="med" len="med"/>` : "";

  return `<p:cxnSp>
    <p:nvCxnSpPr>
      <p:cNvPr id="${spid}" name="arrow ${spid}"/>
      <p:cNvCxnSpPr/>
      <p:nvPr/>
    </p:nvCxnSpPr>
    <p:spPr>
      <a:xfrm${flipH}${flipV}>
        <a:off x="${emuX}" y="${emuY}"/>
        <a:ext cx="${emuW}" cy="${emuH}"/>
      </a:xfrm>
      <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>
      <a:ln w="${strokeWidth}"><a:solidFill><a:srgbClr val="${strokeHex}"/></a:solidFill><a:prstDash val="${dashKind}"/>${headStart}${headEnd}</a:ln>
    </p:spPr>
  </p:cxnSp>`;
}

/** Build a text-only box for directoor-text shapes. */
function buildTextBoxXml(
  editor: Editor,
  shape: TLShape,
  spid: number,
  emuX: number,
  emuY: number,
  emuW: number,
  emuH: number,
): string {
  const props = shape.props as {
    text: string;
    richText?: unknown;
    color?: string;
    size?: "xs" | "s" | "m" | "l" | "xl";
    weight?: "normal" | "bold";
    align?: "left" | "center" | "right";
  };
  // Prefer the rich-text JSON (authoritative since the richText migration);
  // fall back to the legacy plain-text prop for shapes created before it.
  const text = props.richText
    ? renderPlaintextFromRichText(editor, props.richText as never)
    : (props.text ?? "");
  const color = hex(props.color ?? "#0F172A");
  const sizeMap = { xs: 800, s: 1000, m: 1200, l: 1600, xl: 2200 };
  const sizePt = sizeMap[props.size ?? "m"] ?? 1200;
  const b = props.weight === "bold" ? ' b="1"' : "";
  const alignRaw = props.align ?? "center";
  const algn = alignRaw === "left" ? "l" : alignRaw === "right" ? "r" : "ctr";

  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${spid}" name="text ${spid}"/>
      <p:cNvSpPr txBox="1"/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="${emuX}" y="${emuY}"/>
        <a:ext cx="${Math.max(1, emuW)}" cy="${Math.max(1, emuH)}"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:noFill/>
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square" anchor="ctr" rtlCol="0"/>
      <a:lstStyle/>
      ${text
        .split(/\r?\n/)
        .map(
          (line) =>
            `<a:p><a:pPr algn="${algn}"/>${
              line.length === 0
                ? `<a:endParaRPr lang="en-US"/>`
                : `<a:r><a:rPr lang="en-US" sz="${sizePt}"${b} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r>`
            }</a:p>`,
        )
        .join("")}
    </p:txBody>
  </p:sp>`;
}

// ─── Timing / animation XML ──────────────────────────────────

/**
 * Build a <p:timing> fragment with one clickEffect entrance per step in
 * `targetSpids`. Matches canvas playback: press → to reveal the next
 * shape, in the order the region's sequence was committed.
 */
function buildTimingXml(targetSpids: number[]): string {
  if (targetSpids.length === 0) return "";

  let idCounter = 3;
  const nextId = () => idCounter++;

  const steps = targetSpids
    .map((spid) => {
      const outerParId = nextId();
      const innerParId = nextId();
      const effectParId = nextId();
      const setDurId = nextId();
      return `<p:par>
        <p:cTn id="${outerParId}" fill="hold">
          <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
          <p:childTnLst>
            <p:par>
              <p:cTn id="${innerParId}" fill="hold">
                <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                <p:childTnLst>
                  <p:par>
                    <p:cTn id="${effectParId}" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect">
                      <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                      <p:childTnLst>
                        <p:set>
                          <p:cBhvr>
                            <p:cTn id="${setDurId}" dur="1" fill="hold"/>
                            <p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>
                            <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
                          </p:cBhvr>
                          <p:to><p:strVal val="visible"/></p:to>
                        </p:set>
                      </p:childTnLst>
                    </p:cTn>
                  </p:par>
                </p:childTnLst>
              </p:cTn>
            </p:par>
          </p:childTnLst>
        </p:cTn>
      </p:par>`;
    })
    .join("");

  const bldEntries = targetSpids
    .map((spid) => `<p:bldP spid="${spid}" grpId="0"/>`)
    .join("");

  return `<p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
          <p:childTnLst>
            <p:seq concurrent="1" nextAc="seek">
              <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
                <p:childTnLst>
                  ${steps}
                </p:childTnLst>
              </p:cTn>
              <p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>
              <p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>
            </p:seq>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
    <p:bldLst>
      ${bldEntries}
    </p:bldLst>
  </p:timing>`;
}

// ─── Boilerplate pptx part templates ─────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

const PRESENTATION_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;

const SLIDE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

const SLIDE_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

const SLIDE_LAYOUT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const SLIDE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;

const SLIDE_MASTER_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/></a:schemeClr></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;

function buildPresentationXml(slideCx: number, slideCy: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
  </p:sldIdLst>
  <p:sldSize cx="${slideCx}" cy="${slideCy}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function buildSlideXml(shapes: string, timingXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapes}
    </p:spTree>
  </p:cSld>
  ${timingXml}
</p:sld>`;
}

// ─── Main entry point ────────────────────────────────────────

export async function exportRegionAsPPTX(
  editor: Editor,
  region: AnimationRegionData,
  opts: PPTXExportOptions = {},
): Promise<void> {
  if (region.shapeIds.length === 0) throw new Error("Region has no shapes");

  const rb = computeRegionBounds(editor, region);
  if (!rb) throw new Error("Could not compute region bounds");

  // Uniform scale-to-fit if the region exceeds PPT's maximum slide size.
  // Default is 1 (no scale) so sizes stay identical — the user's core
  // requirement. Only very wide canvases will hit this.
  const rawCx = rb.w * PX_TO_EMU;
  const rawCy = rb.h * PX_TO_EMU;
  const scale = Math.min(1, MAX_SLIDE_EMU / Math.max(rawCx, rawCy));
  const slideCx = Math.round(rawCx * scale);
  const slideCy = Math.round(rawCy * scale);

  opts.onProgress?.(0.1);

  // Build one <p:sp> / <p:cxnSp> per shape, in the original order so
  // sequence indexes (1-based into shapeIds) map to stable PPT shape ids.
  const shapeXmls: string[] = [];
  const shapeIds = region.shapeIds;
  for (let i = 0; i < shapeIds.length; i++) {
    const shape = editor.getShape(shapeIds[i]!);
    if (!shape) continue;
    const spid = 100 + i; // deterministic shape ids; 1 is reserved for the group root.

    if (shape.type === "directoor-arrow") {
      shapeXmls.push(buildArrowXml(editor, shape, spid, rb.x, rb.y));
      continue;
    }

    const bounds = editor.getShapePageBounds(shapeIds[i]!);
    if (!bounds) continue;
    const emuX = Math.round((bounds.x - rb.x) * PX_TO_EMU * scale);
    const emuY = Math.round((bounds.y - rb.y) * PX_TO_EMU * scale);
    const emuW = Math.round(bounds.w * PX_TO_EMU * scale);
    const emuH = Math.round(bounds.h * PX_TO_EMU * scale);

    if (shape.type === "directoor-text") {
      shapeXmls.push(buildTextBoxXml(editor, shape, spid, emuX, emuY, emuW, emuH));
    } else {
      shapeXmls.push(buildGeoShapeXml(editor, shape, spid, emuX, emuY, emuW, emuH));
    }
  }

  // region.sequence holds 1-based indexes into shapeIds. Convert to the
  // spids we assigned above (100 + (idx - 1)).
  const targetSpids = region.sequence
    .map((idx) => 100 + (idx - 1))
    .filter((spid) => spid >= 100 && spid < 100 + shapeIds.length);
  const timingXml = buildTimingXml(targetSpids);

  const slideXml = buildSlideXml(shapeXmls.join("\n"), timingXml);

  opts.onProgress?.(0.6);

  // Assemble the .pptx (a standard ZIP under the covers).
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")!.file(".rels", ROOT_RELS_XML);
  zip.folder("ppt")!.file("presentation.xml", buildPresentationXml(slideCx, slideCy));
  zip.folder("ppt/_rels")!.file("presentation.xml.rels", PRESENTATION_RELS_XML);
  zip.folder("ppt/slides")!.file("slide1.xml", slideXml);
  zip.folder("ppt/slides/_rels")!.file("slide1.xml.rels", SLIDE_RELS_XML);
  zip.folder("ppt/slideLayouts")!.file("slideLayout1.xml", SLIDE_LAYOUT_XML);
  zip.folder("ppt/slideLayouts/_rels")!.file("slideLayout1.xml.rels", SLIDE_LAYOUT_RELS_XML);
  zip.folder("ppt/slideMasters")!.file("slideMaster1.xml", SLIDE_MASTER_XML);
  zip.folder("ppt/slideMasters/_rels")!.file("slideMaster1.xml.rels", SLIDE_MASTER_RELS_XML);
  zip.folder("ppt/theme")!.file("theme1.xml", THEME_XML);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  opts.onProgress?.(1);

  download(blob, `directoor-animation-${region.id}.pptx`);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
