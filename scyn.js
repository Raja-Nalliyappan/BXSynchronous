const oldZipFile = []
const newZipFile = []

async function startCompare() {
    oldZipFile.length = 0;
    newZipFile.length = 0;
    
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

    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.toLowerCase().includes("docx")) return

        if(label === "OLD ZIP"){
            oldZipFile.push(zipEntry)
        }else if(label === "NEW ZIP"){
            newZipFile.push(zipEntry)
        }
    });

    let allFile = [...oldZipFile, ...newZipFile]

    for (const zipEntry of allFile) {
        if (zipEntry.name.toLowerCase().endsWith(".xsd")) {
            parseXSD(zipEntry, zipEntry.name);
        }
    }
}


//XSD Presentation Role 
async function parseXSD(zipEntry, fileName) {
    const xsdText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xsdText, "application/xml");

    const elements = xmlDoc.getElementsByTagName("link:definition");
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

