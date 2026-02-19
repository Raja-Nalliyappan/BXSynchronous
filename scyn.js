async function startCompare() {
    const oldFile = document.getElementById("oldZip").files[0];
    const newFile = document.getElementById("newZip").files[0];

    if (!oldFile || !newFile) {
        alert("Please select both zip files.");
        return;
    }

    await printZipContents(oldFile, "OLD ZIP");
    await printZipContents(newFile, "NEW ZIP");
}

async function printZipContents(file, label) {
    const zip = await JSZip.loadAsync(file);
    console.log(label);

    const remainingFiles = []

    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.toLowerCase().includes("docx")) return
        remainingFiles.push(zipEntry)
        console.log(relativePath);
    });

    for (const zipEntry of remainingFiles) {
        if (zipEntry.name.toLowerCase().endsWith(".xsd")) {
            const content = await zipEntry.async("text");
            parseXSD(content, zipEntry.name);
        }
    }
}


function parseXSD(xsdText, fileName) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xsdText, "application/xml");

    const elements = xmlDoc.getElementsByTagName("link:definition");
    console.log(`Elements in ${fileName}:`);
    for (const el of elements) {
        const lines = el.textContent.split("\n");

        const cleaned = lines.map(line =>
            line.replace(/^\d+\s*-\s*(Statement|Disclosure|Document)\s*-\s*/, '')
        );
        cleaned.forEach(line => {
            if (line) console.log(line);
        });
    }
}
