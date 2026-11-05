from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from pptx import Presentation
from pptx.util import Inches as PInches, Pt as PPt
from pptx.dml.color import RGBColor

root = Path(__file__).resolve().parent.parent
samples = root / "samples"
samples.mkdir(exist_ok=True)
font_path = str(root / "resources" / "fonts" / "SourceHanSansSC-Regular.ttf")
font = ImageFont.truetype(font_path, 34)
font_small = ImageFont.truetype(font_path, 24)
font_title = ImageFont.truetype(font_path, 58)

for idx, title in enumerate(["费用报销单", "合同附件"], start=1):
    img = Image.new("RGB", (1240, 1754), "#fbfaf5")
    draw = ImageDraw.Draw(img)
    draw.rectangle((70, 60, 1170, 120), fill="#eef3eb")
    draw.text((95, 75), title, font=font_title, fill="#25352a")
    draw.text((95, 180), "青笺科技有限公司 · 内部资料", font=font, fill="#59645a")
    draw.line((80, 250, 1160, 250), fill="#c9d2c8", width=2)
    rows = [
        ("申请人", "林 澄", "部门", "产品设计"),
        ("日期", "2026-11-05", "编号", f"QJ-2026-{idx:03d}"),
        ("项目", "差旅与办公用品", "金额", "¥ 1,286.00"),
        ("备注", "本地处理演示扫描件", "状态", "待归档"),
    ]
    y = 300
    for label1, value1, label2, value2 in rows:
        draw.text((100, y), label1, font=font_small, fill="#6e786e")
        draw.text((230, y), value1, font=font, fill="#27312a")
        draw.text((650, y), label2, font=font_small, fill="#6e786e")
        draw.text((780, y), value2, font=font, fill="#27312a")
        draw.line((100, y + 68, 1140, y + 68), fill="#e1e5dc", width=1)
        y += 100
    draw.text((100, y + 60), "说明：此文档由青笺 PDF 生成，仅用于功能测试。", font=font_small, fill="#7a8278")
    draw.rectangle((100, y + 280, 1140, y + 640), outline="#d5dcd2", width=2)
    draw.text((125, y + 310), "审批意见", font=font, fill="#3d4a3f")
    draw.line((125, y + 600, 540, y + 600), fill="#8b978b", width=2)
    draw.text((125, y + 612), "负责人签字", font=font_small, fill="#7a8278")
    img.save(samples / f"scan-{idx}.jpg", quality=92)

# Word
doc = Document()
style = doc.styles["Normal"]
style.font.name = "Microsoft YaHei"
style.font.size = Pt(11)
doc.add_heading("产品体验周报", level=0)
doc.add_paragraph("第 45 周 · 青笺 PDF 项目组")
doc.add_heading("本周进展", level=1)
doc.add_paragraph("完成 PDF 工具箱首版，覆盖整理、转换、编辑、安全与审阅五组能力。")
doc.add_paragraph("优化了暖白色界面与无边框窗口，在 1280×820 下完成视觉走查。")
doc.add_heading("关键数据", level=1)
table = doc.add_table(rows=1, cols=3)
table.style = "Light Grid Accent 1"
for i, value in enumerate(["指标", "目标", "本周"]):
    table.rows[0].cells[i].text = value
for row in [("可用工具", "20", "27"), ("首屏加载", "< 1.5s", "1.1s"), ("对比通过率", "95%", "98%")]:
    cells = table.add_row().cells
    for i, value in enumerate(row):
        cells[i].text = value
doc.add_heading("下周计划", level=1)
doc.add_paragraph("补齐批量处理、快捷键与更多 OCR 语言。")
doc.save(samples / "sample.docx")

# Excel
wb = Workbook()
ws = wb.active
ws.title = "季度数据"
headers = ["月份", "处理文件数", "平均耗时(秒)", "满意度"]
for col, value in enumerate(headers, start=1):
    cell = ws.cell(row=1, column=col, value=value)
    cell.font = Font(name="Microsoft YaHei", bold=True, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor="3F6B52")
    cell.alignment = Alignment(horizontal="center")
for r, row in enumerate([
    ["7 月", 1280, 14.2, 4.5],
    ["8 月", 1462, 13.1, 4.6],
    ["9 月", 1684, 12.4, 4.7],
    ["10 月", 1750, 11.8, 4.8],
], start=2):
    for c, value in enumerate(row, start=1):
        cell = ws.cell(row=r, column=c, value=value)
        cell.font = Font(name="Microsoft YaHei")
ws.column_dimensions["A"].width = 14
ws.column_dimensions["B"].width = 18
ws.column_dimensions["C"].width = 18
ws.column_dimensions["D"].width = 14
ws2 = wb.create_sheet("说明")
ws2["A1"] = "数据为演示用途"
ws2["A1"].font = Font(name="Microsoft YaHei", size=14, bold=True)
wb.save(samples / "sample.xlsx")

# PowerPoint
prs = Presentation()
prs.slide_width = PInches(13.333)
prs.slide_height = PInches(7.5)
for i, (title, body) in enumerate([
    ("青笺 PDF", "把文件收拾得妥帖"),
    ("三个设计原则", "安静 · 清晰 · 本机处理"),
    ("接下来", "OCR 质量、批量处理、快捷键"),
]):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = RGBColor(0xFA, 0xF8, 0xF1)
    box = slide.shapes.add_textbox(PInches(0.9), PInches(2.0), PInches(11.5), PInches(1.2))
    tf = box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = PPt(42)
    p.font.bold = True
    p.font.name = "Microsoft YaHei"
    p.font.color.rgb = RGBColor(0x25, 0x35, 0x2A)
    box2 = slide.shapes.add_textbox(PInches(1.0), PInches(3.5), PInches(11), PInches(1.5))
    p2 = box2.text_frame.paragraphs[0]
    p2.text = body
    p2.font.size = PPt(22)
    p2.font.name = "Microsoft YaHei"
    p2.font.color.rgb = RGBColor(0x55, 0x64, 0x57)
    line = slide.shapes.add_shape(1, PInches(1.0), PInches(5.5), PInches(1.4), PInches(0.08))
    line.fill.solid()
    line.fill.fore_color.rgb = RGBColor(0x3F, 0x6B, 0x52)
    line.line.fill.background()
prs.save(samples / "sample.pptx")

html = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>青笺 · 网页打印测试</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;color:#243127;margin:36px;background:#f8f5ed}
h1{font-size:32px;color:#2f5540;letter-spacing:-.5px}
.card{border:1px solid #dcd6c7;background:#fffdf8;border-radius:12px;padding:20px;margin:18px 0}
.badge{display:inline-block;background:#e5eee5;color:#3f6b52;padding:3px 9px;border-radius:99px;font-size:11px}
table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12px}
td,th{border:1px solid #ddd6c7;padding:8px;text-align:left}
th{background:#f0eee4}
</style></head><body>
<span class="badge">QINGJIAN / HTML</span>
<h1>把网页安静地打印成 PDF</h1>
<p>这是一份用于测试 HTML 转 PDF 的示例页面。青笺使用 Chromium 的打印引擎，保留字体、表格与背景色。</p>
<div class="card"><strong>本机打印</strong><p>页面不会上传到服务器，处理结束后临时窗口会自动销毁。</p></div>
<table><tr><th>项目</th><th>状态</th></tr><tr><td>字体</td><td>微软雅黑</td></tr><tr><td>背景色</td><td>#f8f5ed</td></tr><tr><td>页边距</td><td>12 mm</td></tr></table>
</body></html>"""
(samples / "sample.html").write_text(html, encoding="utf-8")
print("office/image samples generated")
