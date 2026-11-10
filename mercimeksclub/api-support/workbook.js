import { strToU8, zipSync } from 'fflate';

const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xml(value) {
  return String(value).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
    .replace(/\r/g, '&#13;');
}

export function makeWorkbook(rows) {
  const table = rows.map((row, index) => {
    const cells = row.map((value, column) => {
      const position = String.fromCharCode(65 + column) + (index + 1);
      if (typeof value === 'number') return '<c r="' + position + '"><v>' + value + '</v></c>';
      return '<c r="' + position + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
    }).join('');
    return '<row r="' + (index + 1) + '">' + cells + '</row>';
  }).join('');
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>',
    '_rels/.rels': '<Relationships xmlns="' + relationships + '"><Relationship Id="rId1" Type="'
      + office + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="' + spreadsheet + '" xmlns:r="' + office
      + '"><bookViews><workbookView/></bookViews><sheets><sheet name="Satın alma bildirimleri" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="' + relationships + '"><Relationship Id="rId1" Type="'
      + office + '/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="' + spreadsheet
      + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      + '</sheetView></sheetViews><cols>'
      + [28, 30, 24, 38, 10, 68].map((width, index) => {
        const column = index + 1;
        return '<col min="' + column + '" max="' + column + '" width="' + width + '" customWidth="1"/>';
      }).join('')
      + '</cols><sheetData>' + table + '</sheetData><autoFilter ref="A1:F' + rows.length + '"/></worksheet>'
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [
    name, strToU8(declaration + content)
  ])), { level: 6 });
}
