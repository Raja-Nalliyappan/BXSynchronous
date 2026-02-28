const oldAxisDomainMap = {};
const newAxisDomainMap = {};
const oldDomainMemberMap = {};
const newDomainMemberMap = {};

async function parseDefinitionLinkbase(zipEntry, fileType) {
    const xmlText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    const axisDomainMap = {};
    const domainMemberMap = {};

    const definitionLinks = xmlDoc.querySelectorAll("link\\:definitionLink, definitionLink");

    const stripPrefix = (s) => s.includes(":") ? s.split(":")[1] : s;

    definitionLinks.forEach(link => {
        const locs = link.querySelectorAll("link\\:loc, loc");
        const arcs = link.querySelectorAll("link\\:definitionArc, definitionArc");

        const labelToConcept = {};
        locs.forEach(loc => {
            const label = loc.getAttribute("xlink:label");
            const href = loc.getAttribute("xlink:href");
            if (!label || !href) return;
            labelToConcept[label] = stripPrefix(href.split("#")[1]);
        });

        arcs.forEach(arc => {
            const from = arc.getAttribute("xlink:from");
            const to = arc.getAttribute("xlink:to");
            const arcrole = arc.getAttribute("xlink:arcrole");
            if (!from || !to || !arcrole) return;

            const parent = labelToConcept[from];
            const child = labelToConcept[to];

            if (!parent || !child) return;

            // Dimension → Domain
            if (arcrole.endsWith("dimension-domain")) {
                axisDomainMap[parent] = child;
            }

            // Domain → Member
            if (arcrole.endsWith("domain-member")) {
                if (!domainMemberMap[parent]) domainMemberMap[parent] = [];
                domainMemberMap[parent].push(child);
            }
        });
    });

    if (fileType === "OLDZIP") {
        Object.assign(oldAxisDomainMap, axisDomainMap);
        Object.assign(oldDomainMemberMap, domainMemberMap);
    } else {
        Object.assign(newAxisDomainMap, axisDomainMap);
        Object.assign(newDomainMemberMap, domainMemberMap);
    }
}


async function exportToExcel() {

    if (typeof ExcelJS === "undefined") {
        alert("Please include ExcelJS library");
        return;
    }

    const roleButtons = document.querySelectorAll(".role-btn");
    if (!roleButtons.length) {
        alert("No presentation roles found");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const usedSheetNames = new Set();

    for (const btn of roleButtons) {

        let roleName = btn.textContent.trim();

        // 🔹 Remove prefix before " - "
        if (roleName.includes(" - ")) {
            roleName = roleName.split(" - ").pop().trim();
        }

        // 🔹 Excel max 31 chars
        let sheetName = roleName.substring(0, 31);

        // 🔹 Ensure unique sheet name
        let counter = 1;
        while (usedSheetNames.has(sheetName)) {
            const base = roleName.substring(0, 28);
            sheetName = `${base}_${counter}`;
            counter++;
        }
        usedSheetNames.add(sheetName);

        // Click role to render table
        btn.click();
        await new Promise(resolve => setTimeout(resolve, 300));

        const table = document.querySelector(".content table");
        if (!table) continue;

        const worksheet = workbook.addWorksheet(sheetName);
        const rows = table.querySelectorAll("tr");

        rows.forEach((row, rowIndex) => {

            const cells = row.querySelectorAll("th, td");
            const rowData = [];

            cells.forEach(cell => {
                rowData.push(cell.innerText.trim() || "-");
            });

            const excelRow = worksheet.addRow(rowData);

            if (rowIndex === 0) {
                excelRow.font = { bold: true };
            }

            cells.forEach((cell, colIndex) => {

                const excelCell = excelRow.getCell(colIndex + 1);

                if (cell.classList.contains("cell-added")) {
                    excelCell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FFCCFFCC" }
                    };
                }

                if (cell.classList.contains("cell-removed")) {
                    excelCell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FFFFCCCC" }
                    };
                }

                if (cell.classList.contains("cell-changed")) {
                    excelCell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FFFFFF99" }
                    };
                }

            });

        });

        worksheet.columns.forEach(col => col.width = 25);
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "All_Presentation_Roles.xlsx";
    link.click();
}