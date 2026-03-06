const oldZipFile = [];
const newZipFile = [];
const oldRoleConceptMap = {};
const newRoleConceptMap = {};

async function startCompare() {

    [oldZipFile, newZipFile, oldPresentationRoles, newPresentationRoles, oldFacts, newFacts].forEach(arry => arry.length = 0);

    const oldFile = document.getElementById("oldZip").files[0];
    const newFile = document.getElementById("newZip").files[0];

    if (!oldFile || !newFile) {
        alert("Please select both zip files.");
        return;
    }

    await Promise.all([
        printZipContents(oldFile, "OLD ZIP"),
        printZipContents(newFile, "NEW ZIP")
    ]);

    for (const zipEntry of oldZipFile) {
        const name = zipEntry.name.toLowerCase();

        if (name.endsWith(".xsd")) {
            await parseXsdRoles(zipEntry, "OLDZIP");
        } else if (name.endsWith("_lab.xml")) {
            await parseLabelLinkbase(zipEntry, "OLDZIP");
        } else if (name.endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "OLDZIP");
        } else if (name.endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "OLDZIP");
        } else if (name.endsWith("_def.xml")) {
            await parseDefinitionLinkbase(zipEntry, "OLDZIP");
        }
    }

    for (const zipEntry of newZipFile) {
        const name = zipEntry.name.toLowerCase();

        if (name.endsWith(".xsd")) {
            await parseXsdRoles(zipEntry, "NEWZIP");
        } else if (name.endsWith("_lab.xml")) {
            await parseLabelLinkbase(zipEntry, "NEWZIP");
        } else if (name.endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "NEWZIP");
        } else if (name.endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "NEWZIP");
        } else if (name.endsWith("_def.xml")) {
            await parseDefinitionLinkbase(zipEntry, "NEWZIP");
        }
    }
    presentationRoleCompare();
}

async function printZipContents(file, label) {
    const zip = await JSZip.loadAsync(file);

    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.toLowerCase().includes("docx")) return;

        if (label === "OLD ZIP") {
            oldZipFile.push(zipEntry);
        } else if (label === "NEW ZIP") {
            newZipFile.push(zipEntry);
        }
    });
}


function normalize(str) {
    return (str || "").toLowerCase().replace(/\s+/g, "").trim();
}

function buildKey(obj) {
    return normalize(obj?.concept);
}


//  MAIN RENDER FUNCTION
function renderConceptTable(oldData = [], newData = []) {

    const tbody = document.querySelector(".content tbody");
    tbody.innerHTML = "";

    const usedNew = new Set();

    oldData.forEach(oldFact => {
        const matchedIndex = newData.findIndex((newFact, index) =>
            !usedNew.has(index) && buildKey(oldFact) === buildKey(newFact)
        );

        if (matchedIndex !== -1) {
            usedNew.add(matchedIndex);
            renderRow(oldFact, newData[matchedIndex], tbody);
        } else {
            renderRow(oldFact, {}, tbody);
        }
    });

    newData.forEach((newFact, index) => {
        if (!usedNew.has(index)) {
            renderRow({}, newFact, tbody);
        }
    });
}

function renderRow(oldFact = {}, newFact = {}, tbody) {
    const tr = document.createElement("tr");

    const createCell = (oldValue, newValue, side) => {
        const td = document.createElement("td");
        const value = side === "old" ? oldValue ?? "" : newValue ?? "";
        td.textContent = value || "-";
        td.title = value || "-";

        if (!oldValue && newValue && side === "new") td.classList.add("cell-added");
        else if (oldValue && !newValue && side === "old") td.classList.add("cell-removed");
        else if (oldValue && newValue && oldValue !== newValue) td.classList.add("cell-changed");

        return td;
    };

    const createAxisCell = (oldAxis = [], newAxis = [], side) => {
        const td = document.createElement("td");
        const axisArray = side === "old" ? oldAxis : newAxis;
        const oldText = JSON.stringify(oldAxis);
        const newText = JSON.stringify(newAxis);

        if (!axisArray.length) td.textContent = "-";
        else {
            const ul = document.createElement("ul");
            ul.style.margin = "0";
            ul.style.paddingLeft = "15px";

            axisArray.forEach(({ axis, member }) => {
                const li = document.createElement("li");
                li.innerHTML = `<span style="font-size:10px"><b>Axis:</b> ${axis}<br><b>Member:</b> ${member}</span>`;
                ul.appendChild(li);
            });

            td.appendChild(ul);
        }

        if ((!oldText || oldText === "[]") && newText !== "[]" && side === "new") td.classList.add("cell-added");
        else if ((!newText || newText === "[]") && oldText !== "[]" && side === "old") td.classList.add("cell-removed");
        else if (oldText !== newText && oldText !== "[]" && newText !== "[]") td.classList.add("cell-changed");

        return td;
    };

    tr.appendChild(createCell(oldFact.concept, newFact.concept, "old"));
    tr.appendChild(createCell(oldFact.concept, newFact.concept, "new"));

    tr.appendChild(createCell(oldFact.label, newFact.label, "old"));
    tr.appendChild(createCell(oldFact.label, newFact.label, "new"));

    tr.appendChild(createCell(oldFact.value, newFact.value, "old"));
    tr.appendChild(createCell(oldFact.value, newFact.value, "new"));

    tr.appendChild(createAxisCell(oldFact.axisMembers, newFact.axisMembers, "old"));
    tr.appendChild(createAxisCell(oldFact.axisMembers, newFact.axisMembers, "new"));

    const oldPeriodVal = oldFact.contextRef ? oldPeriod[oldFact.contextRef] : "";
    const newPeriodVal = newFact.contextRef ? newPeriod[newFact.contextRef] : "";
    tr.appendChild(createCell(oldPeriodVal, newPeriodVal, "old"));
    tr.appendChild(createCell(oldPeriodVal, newPeriodVal, "new"));

    const oldUnitVal = oldFact.unitRef ? oldUnit[oldFact.unitRef] : "";
    const newUnitVal = newFact.unitRef ? newUnit[newFact.unitRef] : "";
    tr.appendChild(createCell(oldUnitVal, newUnitVal, "old"));
    tr.appendChild(createCell(oldUnitVal, newUnitVal, "new"));

    tr.appendChild(createCell(oldFact.scale, newFact.scale, "old"));
    tr.appendChild(createCell(oldFact.scale, newFact.scale, "new"));

    tr.appendChild(createCell(oldFact.inlineSentence, newFact.inlineSentence, "old"));
    tr.appendChild(createCell(oldFact.inlineSentence, newFact.inlineSentence, "new"));

    tbody.appendChild(tr);
}


const roleContainer = document.querySelector(".presentationRole");

roleContainer.addEventListener("click", (e) => {
    const btn = e.target;
    if (!btn.classList.contains("role-btn")) return;

    roleContainer.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const roleName = btn.textContent.trim();
    filterFactsByRole(roleName);
});


function filterFactsByRole(roleName) {
    const oldConcepts = oldRoleConceptMap[roleName] || [];
    const newConcepts = newRoleConceptMap[roleName] || [];

    const normalize = (str) =>
        typeof str === "string" ? str.toLowerCase().replace(":", "_").trim() : "";

    const oldConceptSet = new Set(oldConcepts.map(c => normalize(c.concept)));
    const newConceptSet = new Set(newConcepts.map(c => normalize(c.concept)));

    function extractFacts(factsArray, conceptObj, conceptSet) {
        const seen = new Set();
        const conceptNormalized = normalize(conceptObj.concept);
        const results = [];

        factsArray.forEach(fact => {
            const factConcept = normalize(fact.concept);

            if (factConcept !== conceptNormalized) return;

            // Check axis members if any
            if (fact.axisMembers?.length > 0) {
                const allAxisMatch = fact.axisMembers.every(a =>
                    conceptSet.has(normalize(a.axis)) &&
                    conceptSet.has(normalize(a.member))
                );
                if (!allAxisMatch) return;
            } else if (!conceptSet.has(factConcept)) {
                return;
            }

            const key = `${factConcept}|${fact.contextRef || ""}|${fact.unitRef || ""}|${fact.scale || ""}|${fact.value || ""}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push({ ...fact });
            }
        });

        return results;
    }

    function processConcepts(concepts, facts, type, conceptSet) {
        const ordered = [];

        concepts.forEach(conceptObj => {
            const label = getPreferredLabel(conceptObj, type);
            const matchedFacts = extractFacts(facts, conceptObj, conceptSet);

            if (matchedFacts.length === 0) {
                ordered.push({ concept: conceptObj.concept, label, value: "-", axisMembers: [] });
            } else {
                matchedFacts.forEach(f => ordered.push({ ...f, concept: conceptObj.concept, label }));
            }
        });

        return ordered;
    }

    const orderedOld = processConcepts(oldConcepts, oldFacts, "OLDZIP", oldConceptSet);
    const orderedNew = processConcepts(newConcepts, newFacts, "NEWZIP", newConceptSet);

    renderConceptTable(orderedOld, orderedNew);
}

function presentationRoleCompare() {
    const container = document.querySelector(".presentationRole");
    container.innerHTML = "";

    newPresentationRoles.forEach((role, index) => {
        const btn = document.createElement("button");
        btn.textContent = role;
        btn.className = "role-btn";
        if (index === 0) btn.classList.add("active");
        container.appendChild(btn);
    });

    const firstBtn = container.querySelector(".role-btn");
    if (firstBtn) filterFactsByRole(firstBtn.textContent.trim());
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

    const getUniqueSheetName = (name) => {
        let base = name.includes(" - ") ? name.split(" - ").pop().trim() : name.trim();
        let sheetName = base.substring(0, 31);
        let counter = 1;
        while (usedSheetNames.has(sheetName)) {
            sheetName = `${base.substring(0, 28)}_${counter++}`;
        }
        usedSheetNames.add(sheetName);
        return sheetName;
    };

    const getCellFill = (cell) => {
        if (cell.classList.contains("cell-added")) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCFFCC" } };
        if (cell.classList.contains("cell-removed")) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
        if (cell.classList.contains("cell-changed")) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF99" } };
        return null;
    };

    for (const btn of roleButtons) {
        const sheetName = getUniqueSheetName(btn.textContent);
        btn.click();
        await new Promise(resolve => setTimeout(resolve, 300));

        const table = document.querySelector(".content table");
        if (!table) continue;

        const worksheet = workbook.addWorksheet(sheetName);

        Array.from(table.querySelectorAll("tr")).forEach((row, rowIndex) => {
            const excelRow = worksheet.addRow(Array.from(row.querySelectorAll("th, td")).map(cell => cell.innerText.trim() || "-"));

            if (rowIndex === 0) excelRow.font = { bold: true };

            Array.from(row.querySelectorAll("th, td")).forEach((cell, colIndex) => {
                const fill = getCellFill(cell);
                if (fill) excelRow.getCell(colIndex + 1).fill = fill;
            });
        });

        worksheet.columns.forEach(col => col.width = 25);
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "BX Scyn.xlsx";
    link.click();
}


function properRoleName(role) {

    const isParenthetical = /\(parentheticals?\)/i.test(role);

    let properRole = role
        .replace(/\(parentheticals?\)/gi, "")
        .replace(/\(unaudited\)/gi, "")
        .replace(/\bunaudited\b/gi, "")
        .replace(/\baudited\b/gi, "")
        .replace(/\bcondensed\b/gi, "")
        .replace(/[’']/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    properRole = properRole.replace(/shareholders?/g, "shareholders");

    properRole = properRole.replace(/^statements of /, "statement of ");

    if (properRole.includes("changes in shareholders deficit")) {
        properRole = "Statement of Changes in Shareholders Deficit";
    } else if (properRole === "document and entity information") {
        properRole = "Cover";
    } else {
        properRole = properRole
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    }

    if (isParenthetical) {
        properRole += " (Parentheticals)";
    }

    return properRole;
}