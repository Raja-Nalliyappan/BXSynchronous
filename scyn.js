const oldZipFile = [];
const newZipFile = [];
const oldRoleConceptMap = {};
const newRoleConceptMap = {};
const oldRoleOrder = [];
const newRoleOrder = [];

async function startCompare() {
    oldZipFile.length = 0;
    newZipFile.length = 0;
    oldPresentationRoles.length = 0;
    newPresentationRoles.length = 0;
    oldRoleOrder.length = 0;
    newRoleOrder.length = 0;
    oldFacts.length = 0;
    newFacts.length = 0;

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
        if (zipEntry.name.toLowerCase().endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "OLDZIP");
        } else if (zipEntry.name.toLowerCase().endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "OLDZIP");
        }
    }

    for (const zipEntry of newZipFile) {
        if (zipEntry.name.toLowerCase().endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "NEWZIP");
        } else if (zipEntry.name.toLowerCase().endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "NEWZIP");
        }
    }
    // renderConceptTable();
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


const oldPresentationRoles = [];
const newPresentationRoles = [];

async function presentationRoles(zipEntry, fileName) {

    const xsdText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xsdText, "application/xml");

    const presentationLinks = xmlDoc.querySelectorAll("presentationLink, link\\:presentationLink");

    for (const link of presentationLinks) {

        const roleURI = link.getAttribute("xlink:role");
        if (!roleURI) continue;

        let roleName = roleURI.split('/').pop();
        roleName = roleName.replace(/([A-Z])/g, ' $1').trim();

        const locElements = link.querySelectorAll("link\\:loc, loc");

        const conceptList = [];

        for (const loc of locElements) {
            const href = loc.getAttribute("xlink:href");
            if (!href) continue;

            const concept = href.split("#")[1];
            if (concept) conceptList.push(concept);
        }

        if (fileName === "OLDZIP") {
            oldRoleConceptMap[roleName] = conceptList;
            oldRoleOrder.push(roleName);
            oldPresentationRoles.push(roleName);
        } else {
            newRoleConceptMap[roleName] = conceptList;
            newRoleOrder.push(roleName);
            newPresentationRoles.push(roleName);
        }

        console.log(oldRoleConceptMap);
    }
}


const oldFacts = [];
const newFacts = [];

async function parseIxbrlFacts(zipEntry, fileName) {

    const htmText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(htmText, "text/html");

    let ixFacts = xmlDoc.querySelectorAll(
        "ix\\:nonFraction, ix\\:nonNumeric, nonFraction, nonNumeric"
    );

    ixFacts.forEach(fact => {

        const factObj = {
            concept: fact.getAttribute("name"),
            value: fact.textContent.trim(),
            contextRef: fact.getAttribute("contextRef"),
            unitRef: fact.getAttribute("unitRef")
        };

        if (fileName === "OLDZIP") {
            oldFacts.push(factObj);
        } else {
            newFacts.push(factObj);
        }

    });
}

function renderConceptTable(oldData = oldFacts, newData = newFacts) {

    const tbody = document.querySelector(".content tbody");
    tbody.innerHTML = "";

    const maxLength = Math.max(oldData.length, newData.length);

    for (let i = 0; i < maxLength; i++) {

        const tr = document.createElement("tr");

        const oldConceptTd = document.createElement("td");

        const oldValue =
            typeof oldData[i] === "string"
                ? oldData[i]
                : oldData[i]?.concept || "-";

        oldConceptTd.textContent = oldValue;
        oldConceptTd.title = oldValue;
        oldConceptTd.classList.add("fixed-concept");


        const newConceptTd = document.createElement("td");

        const newValue =
            typeof newData[i] === "string"
                ? newData[i]
                : newData[i]?.concept || "-";

        newConceptTd.textContent = newValue;
        newConceptTd.title = newValue;
        newConceptTd.classList.add("fixed-concept");

        tr.appendChild(oldConceptTd);
        tr.appendChild(newConceptTd);

        tbody.appendChild(tr);
    }
}


document.querySelector(".presentationRole").addEventListener("click", function (e) {

    if (!e.target.classList.contains("role-btn")) return;

    const roleName = e.target.textContent.trim();
    filterFactsByRole(roleName);
});


function filterFactsByRole(roleName) {

    const oldConcepts = oldRoleConceptMap[roleName] || [];
    const newConcepts = newRoleConceptMap[roleName] || [];

    const normalize = (str) =>
        str?.toLowerCase().replace(":", "_").trim();

    const orderedOld = [];
    const orderedNew = [];

    oldConcepts.forEach(concept => {
        const fact = oldFacts.find(f =>
            normalize(f.concept) === normalize(concept)
        );

        orderedOld.push(fact || { concept: concept });
    });

    newConcepts.forEach(concept => {
        const fact = newFacts.find(f =>
            normalize(f.concept) === normalize(concept)
        );

        orderedNew.push(fact || { concept: concept });
    });

    renderConceptTable(orderedOld, orderedNew);
}



function renderPresentationRoles() {

    const container = document.querySelector(".presentationRole");
    container.innerHTML = "";

    oldRoleOrder.forEach(role => {

        const div = document.createElement("div");
        div.textContent = role;
        div.style.cursor = "pointer";
        div.style.padding = "6px";

        container.appendChild(div);
    });
}


function presentationRoleCompare() {

    const addedRoles = newPresentationRoles.filter(role => !oldPresentationRoles.includes(role));
    const removedRoles = oldPresentationRoles.filter(role => !newPresentationRoles.includes(role));

    let presentationRole = document.getElementsByClassName("presentationRole")[0];
    presentationRole.innerHTML = "";

    newPresentationRoles.forEach(role => {
        let roleBtn = document.createElement("button");
        roleBtn.textContent = role;
        roleBtn.className = "role-btn";
        presentationRole.appendChild(roleBtn);
    });

    if (removedRoles.length > 0) {
        let removeHeading = document.createElement("h4");
        removeHeading.textContent = "Remove List";
        presentationRole.appendChild(removeHeading);

        removedRoles.forEach(role => {
            let p = document.createElement("button");
            p.textContent = role;
            p.className = "role-btn";
            presentationRole.appendChild(p);
        });
    }

    if (addedRoles.length > 0) {
        let addedHeading = document.createElement("h4");
        addedHeading.textContent = "Added List";
        presentationRole.appendChild(addedHeading);

        addedRoles.forEach(role => {
            let p = document.createElement("button");
            p.textContent = role;
            p.className = "role-btn";
            presentationRole.appendChild(p);
        });
    }

    const firstBtn = presentationRole.querySelector(".role-btn");

    if (firstBtn) {
        const firstRole = firstBtn.textContent.trim();
        filterFactsByRole(firstRole);
    }

};
