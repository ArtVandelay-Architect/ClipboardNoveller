// ClipBoardNoveller for Scriptable by Luke Li
// Reader edition v2.0
// Install Reader.html alongside this script in Scriptable Documents.
// Uses the existing local lktextreader library.

// This program allows you to save novels you copied from your clipboard in pages,
// each page is a different text file, and the json file contains the list of main
// file which leads to all the text files.

// This is a largely re-written version of the previous script, but any file created
// should remain compatible.

let debugMode = false;
function dlog (...args) {
	if (debugMode) {
		const result = args.join(' ');
		log(result);
	}
}

// ---
// initialise the file system
let fm = FileManager.local ();
let dirPath = fm.joinPath (fm.documentsDirectory (),"lktextreader");
// json file containing the list of file names
// loads into an array of objects with attributes `filename`, `pages`
// and optionally `hiddenPages[]`, `annotation`
let lofPath = fm.joinPath (dirPath,"/lof.json");

// If the path does not exist, create one.
if (!fm.fileExists (dirPath)){
	fm.createDirectory (dirPath);
}

// a list of files available globally
// everytime `files` is changed,
// `save_files ()` must be called
let files = []
if (fm.fileExists (lofPath)) {
	let raw = fm.readString (lofPath)
	files = JSON.parse (raw)
}
function save_files () {
	fm.writeString (lofPath,JSON.stringify (files));
}
// used to sort file by name
function file_compare (a, b) {
	return a.filename.localeCompare(b.filename)
}
// search wrapper, -1 for not found
function file_name_search (targetName) {
	return files.findIndex (file => (file.filename === targetName));
}
// get the suffix of the file
function get_file_suffix (filePath) {
	let parts = filePath.split ('.');
	if (parts.length > 1) {
		return parts.pop ();
	}
	return '';
}
// swap the file's name for a new suffix
function change_file_suffix (filePath, newSuffix) {
	const lastDotIndex = filePath.lastIndexOf ('.');
	if (lastDotIndex === -1) {
		return filePath + '.' + newSuffix;
	}
	return filePath.substring (0, lastDotIndex + 1) + newSuffix;
}
// get the path of a page of a file in the list
function get_path (fileIndex, pageNum, fileType="") {
	let path = fm.joinPath (dirPath,
		                "/" + files[fileIndex].filename + pageNum.toString ());

	// try to guess the file type
	if (fm.fileExists (path + ".txt") || "txt" == fileType) {
		return path + ".txt";	
	}
	if (fm.fileExists (path + ".png") || "png" == fileType) {
		return path + ".png";	
	}
}
// get the annotation path to a page
function get_annotation_path (fileIndex, pageNum) {
	let path = fm.joinPath (dirPath,
		                "/" + files[fileIndex].filename + pageNum.toString ());
	return path + "_annotation.txt";
}

// Reader.html can be installed in either local or iCloud Scriptable Documents.
// Library data remains in the same local folder used by the original script.
async function load_reader_html() {
    for (const manager of [fm, FileManager.iCloud()]) {
        const path = manager.joinPath(manager.documentsDirectory(), "Reader.html");
        if (!manager.fileExists(path)) continue;
        if (manager.isFileStoredIniCloud(path)) await manager.downloadFileFromiCloud(path);
        return manager.readString(path);
    }
    throw new Error("Install Reader.html in Scriptable Documents (local or iCloud) before opening the reader.");
}

// ---
// initialise the UI
let mainTable = new UITable (); // List of files
mainTable.showSeparators = true;

let pageTable = new UITable (); // List of pages for a file
pageTable.showSeparators = true;
// Hide hidden pages by default
let showHiddenPages = false;

// ---
// page table operations

// add a page from a clipboard of text or image
async function add_page (fileIndex) {
	let content = Pasteboard.paste ();
	let fileType = 'txt';
	if (content == null) {
		// if not text, try image
		content = Pasteboard.pasteImage ();
		fileType = "png";
	}

	if (content == null) {
		// still null means error
		let a = new Alert ();
		a.title = "Null Content";
		a.message = a.title;
		a.addAction ("Confirm");
		await a.presentAlert ();
		return;
	}

	let a = new Alert ();
	a.title = "Confirm Adding?";
	if (fileType == "txt") {
		a.message = content.slice (0, 1000); // provide the clipboard as a sample
	} else {
		a.message = "Preview not Available";
	}
	a.addCancelAction ("Cancel");
	a.addAction ("Confirm");

	let result = await a.presentAlert ();

	if (result == 0) { // confirm
		let pageNum = files[fileIndex].pages + 1;
		let pagePath = get_path (fileIndex, pageNum, fileType);

		if (fileType == "txt") {
			fm.writeString (pagePath, content);
		} else if (fileType == "png") {
			fm.writeImage (pagePath, content);
		}

		files[fileIndex].pages = pageNum;
		save_files ();
	}

	update_page_table (fileIndex);
	pageTable.reload ();
}

// All paths are resolved here, never supplied by the WebView.
async function reader_page(fileIndex, pageNum) {
    try {
        const html = await load_reader_html();
        const book = files[fileIndex];
        const chapters = [];
        for (let number = 1; number <= book.pages; number++) {
            if (number === pageNum || !(book.hiddenPages || []).includes(number)) {
                chapters.push({ number });
            }
        }
        if (!chapters.some(chapter => chapter.number === pageNum)) {
            throw new Error("This page is not in the book.");
        }
        const view = new WebView();
        await view.loadHTML(html);
        async function call(method, value) {
            return await view.evaluateJavaScript(`Reader.${method}(${JSON.stringify(value)})`);
        }
        let currentPage = pageNum;
        async function show(number) {
            if (!Number.isInteger(number) || !chapters.some(chapter => chapter.number === number)) {
                throw new Error("Invalid page number.");
            }
            const path = get_path(fileIndex, number);
            if (!path) throw new Error("The page file is missing.");
            const page = path.endsWith(".txt")
                ? { number, type: "text", content: fm.readString(path) }
                : { number, type: "image", src: "data:image/png;base64," + Data.fromFile(path).toBase64String() };
            await call("show", page);
            currentPage = number;
        }
        function save(number, content) {
            if (number !== currentPage || typeof content !== "string") throw new Error("Invalid edit.");
            const path = get_path(fileIndex, number);
            if (!path || !path.endsWith(".txt")) throw new Error("Only text pages can be edited.");
            fm.writeString(path, content);
        }
        await call("setup", { title: book.filename, chapters });
        await show(pageNum);

        let closed = false;
        let finish;
        const dismissed = new Promise(resolve => { finish = resolve; });
        // Install the receiver before presenting; UI requests are queued between calls.
        const listen = () => view.evaluateJavaScript("Reader.receive(completion)", true);
        let pending = listen();
        const presentation = view.present(true);
        const presentationDone = presentation.then(
            () => { closed = true; finish({ action: "stop" }); },
            error => { closed = true; finish({ action: "stop" }); throw error; }
        );
        try {
            while (!closed) {
                const request = await Promise.race([pending, dismissed]);
                if (closed || request.action === "stop") break;
                try {
                    if (request.action === "open") await show(request.number);
                    else if (request.action === "save") {
                        save(request.number, request.content);
                        await call("saved", null);
                    } else throw new Error("Unknown reader request.");
                } catch (error) {
                    if (!closed) await call("error", String(error.message || error));
                }
                if (!closed) pending = listen();
            }
            await presentationDone;
        } finally {
            // Resolve an outstanding callback when the native Done button is used.
            await view.evaluateJavaScript("Reader.stop()").catch(() => {});
            await pending.catch(() => {});
        }
        const draft = await view.evaluateJavaScript("Reader.draft()");
        if (draft) {
            const alert = new Alert();
            alert.title = "Save unfinished edit?";
            alert.message = "Page " + draft.number + " has unsaved changes.";
            alert.addAction("Save");
            alert.addCancelAction("Discard");
            if (await alert.presentAlert() === 0) save(draft.number, draft.content);
        }
    } catch (error) {
        const alert = new Alert();
        alert.title = "Reader unavailable";
        alert.message = String(error.message || error);
        alert.addAction("OK");
        await alert.presentAlert();
    } finally {
        update_page_table(fileIndex);
        pageTable.reload();
    }
}

async function quicklook_page(fileIndex, pageNum) {
    const path = get_path(fileIndex, pageNum);
    if (path) await QuickLook.present(path, true);
}

async function get_or_create_annotation (fileIndex, pageNum) {
	let annoPath = get_annotation_path (fileIndex, pageNum);
	if (!fm.fileExists (annoPath)) {
		fm.writeString (annoPath, "");
	}

	let content = fm.readString (annoPath);

	let a = new Alert ();
	a.title = "Annotation";
	a.message = content.slice (0, 1000);

	a.addAction ("Copy");
	a.addAction ("Paste");
	a.addAction ("View");
	a.addCancelAction ("Cancel");

	let result = await a.presentAlert ();

	if (result == 0) { // Copy
		Pasteboard.copy (content);
	} else if (result == 1) {
		content = Pasteboard.paste ()

		let a2 = new Alert ();
		a2.title = "Overwrite";
		a2.message = content.slice (0, 1000);
		a2.addCancelAction ("Cancel");
		a2.addAction ("Confirm");

		let result = await a2.presentAlert ();

		if (result == 0) {
			fm.writeString (annoPath, content);
		}
	} else if (result == 2) {
		let ql = QuickLook;
		ql.present (annoPath, false);
	}
}

function toggle_hide_page (fileIndex, pageNum) {
	// create this attribute if it did not exist for backwards compatibility
	if (!files[fileIndex].hasOwnProperty ("hiddenPages")) {
		files[fileIndex]["hiddenPages"] = [];
	}

	if (files[fileIndex].hiddenPages.includes (pageNum)) { // toggle
		let p = files[fileIndex].hiddenPages.indexOf (pageNum);
		if (p != -1) {
			let end = files[fileIndex].hiddenPages.pop ();
			if (p != files[fileIndex].hiddenPages.length) {
				files[fileIndex].hiddenPages[p] = end;
			}
		}
	} else {
		files[fileIndex].hiddenPages.push (pageNum);
	}
	save_files ()

	update_page_table (fileIndex);
	pageTable.reload ();
}

function move_page_up (fileIndex, pageNum) {
	// Do nothing for the first page and exceptions
	if (pageNum <= 1) {
		return;
	}

	let p1 = get_path (fileIndex, pageNum - 1);
	let p2 = get_path (fileIndex, pageNum);

	let newP1 = p1;
	let newP2 = p2;
	if (get_file_suffix (p1) != get_file_suffix (p2)) {
		newP1 = change_file_suffix (p1, get_file_suffix (p2));
		newP2 = change_file_suffix (p2, get_file_suffix (p1));
	}

	// Cannot be bordered with random string generation
	let nonsense = p1 +
		Math.floor (Math.random () * 1000000 + 1).toString ();
    const annotation1 = get_annotation_path(fileIndex, pageNum - 1);
    const annotation2 = get_annotation_path(fileIndex, pageNum);
    const annotationTemp = nonsense + "_annotation";
    const hasAnnotation1 = fm.fileExists(annotation1);
    const hasAnnotation2 = fm.fileExists(annotation2);
    if (hasAnnotation1) fm.move(annotation1, annotationTemp);
    if (hasAnnotation2) fm.move(annotation2, annotation1);
    if (hasAnnotation1) fm.move(annotationTemp, annotation2);
	// Swap files
	fm.move (p1, nonsense);
	fm.move (p2, newP1);
	fm.move (nonsense, newP2);

	if (!files[fileIndex].hasOwnProperty ("hiddenPages")) {
		files[fileIndex]["hiddenPages"] = [];
	}

	// If either page has been hidden
	let pageLoHidden = files[fileIndex].hiddenPages.indexOf (pageNum - 1);
	let pageHiHidden = files[fileIndex].hiddenPages.indexOf (pageNum);
	if (pageLoHidden >= 0) {
		if (pageHiHidden == -1) {
			files[fileIndex].hiddenPages[pageLoHidden] += 1;
			save_files ();
		}
	} else if (pageHiHidden >= 0) {
		if (pageLoHidden == -1) {
			files[fileIndex].hiddenPages[pageHiHidden] -= 1;
			save_files ();
		}
	}

	update_page_table (fileIndex);
	pageTable.reload ();
}

// list the pages of a given file
function update_page_table (fileIndex) {
	pageTable.removeAllRows ();

	let topRow = new UITableRow ();
	topRow.isHeader = true;
	topRow.backgroundColor = new Color ("2B2B2B");
	
	let bckBtn = topRow.addButton ("⬅"); // right Arrow
	bckBtn.widthWeight = 20;
	bckBtn.dismissOnTap = true;
	bckBtn.onTap = () => {
		update_main_table ();
		mainTable.reload ();
	}
	
	let headTitle = topRow.addText ("Menu");
	headTitle.widthWeight = 40;
	headTitle.centerAligned ()
	
	let newBtn = topRow.addButton ("📃"); // an icon with a page on it
	newBtn.widthWeight = 20;
	newBtn.onTap = () => {
		add_page (fileIndex);
	}
	newBtn.rightAligned ();
	
	let showHiddenBtn = topRow.addButton ("😐"); // indicates "unhide"
	showHiddenBtn.widthWeight = 20;
	showHiddenBtn.onTap = () => {
		showHiddenPages = !showHiddenPages;
		update_page_table (fileIndex);
		pageTable.reload ();
	}
	showHiddenBtn.rightAligned ();

	pageTable.addRow (topRow);	

	for (let i = 1; i <= files[fileIndex].pages; i++) { // page number starts on 1
		if (files[fileIndex].hasOwnProperty ("hiddenPages")) {
			if (files[fileIndex].hiddenPages.includes (i)) {
				if (!showHiddenPages) {
					continue;
				}
			}
		} else {
			files[fileIndex]["hiddenPages"] = [];
		}

		let row = new UITableRow ();
		row.dismissOnSelect = false;
		row.height = 60;
		row.onSelect = async (idx) => {
			await reader_page (fileIndex, i);
		}

		let filePath = get_path (fileIndex, i);
		let preview = "No Preview";
		if (get_file_suffix (filePath) == "txt") {
			preview = fm.readString (filePath);
		} else if (get_file_suffix (filePath) == "png") {
			preview = "Image: No Preview";
		}
		preview = preview.replaceAll (/\s/g, ' ');
		preview = preview.slice (0, 50);
		let infoCell = row.addText ("Page: " + i.toString (), preview);
		infoCell.widthWeight = 70;
	
        let quicklookBtn = row.addButton("👁");
        quicklookBtn.widthWeight = 10;
        quicklookBtn.onTap = async () => { await quicklook_page(fileIndex, i); };

		let upBtn = row.addButton ("🔼"); // up arrow
		upBtn.widthWeight = 10;
		upBtn.rightAligned ();
		upBtn.onTap = () => {
			move_page_up (fileIndex, i);
		}

		// actually a toggle hide button
		let hideBtn = row.addButton ("🫥"); // This means 'hide' I suppose.
		hideBtn.widthWeight = 10;
		hideBtn.rightAligned ();
		hideBtn.onTap = () => {
			toggle_hide_page (fileIndex, i);
		}

		pageTable.addRow (row);
	}
}

// ---
// main table operations

// create a new file entry in lof
function create_file (filename) {
	// only proceed if the filename is legal
	// and not duplicated
	if (filename != "" && -1 == file_name_search (filename)){
		let NewFile = {"filename":filename, "pages":0};
		files.push (NewFile);
		save_files ();
	}
	update_main_table ();
	mainTable.reload ();
}

// unlink the file
// unlinking/trashing is semi-destructive, the user can
// retrieve them by going to the target folder,
// but they can be overwritten with a file of the same name
function unlink_file (fileIndex, confirmation) {
	if ("UNLINK" == confirmation) {
		let end = files.pop ();
		if (fileIndex != files.length) {
			files[fileIndex] = end;
		}
		save_files ();
	}
	update_main_table ();
	mainTable.reload ();
}

// open a file entry to display the page list
function open_file (fileIndex) {
	pageTable.reload ();
	update_page_table (fileIndex);
	pageTable.present (true);
}

// populate the main table with files
function update_main_table () {
	mainTable.removeAllRows ();

	topRow = new UITableRow (); // the top row with options
	topRow.isHeader = true;
	topRow.backgroundColor = new Color ("2B2B2B");

	let RefBtn = topRow.addButton ("🔄"); // Refresh button
	RefBtn.widthWeight = 20;
	RefBtn.onTap = () => {
		update_main_table ();
		mainTable.reload ();
	}
	
	let HeadTitle = topRow.addText ("Menu");
	HeadTitle.widthWeight = 60;
	HeadTitle.centerAligned ();

	let NewBtn = topRow.addButton ("📂"); // A button with a file on it
	NewBtn.widthWeight = 20;
	NewBtn.rightAligned ();
	NewBtn.onTap = () => {
		let a = new Alert ();
		a.title = "NewFile Name";
		a.addTextField ("file name").setEmailAddressKeyboard ();
		a.addCancelAction ("Confirm");
		presentation = a.presentAlert ()
		// Only proceed after the file name has been inputted
		presentation.then (
			function () {
				create_file (a.textFieldValue (0));
			},
			function () {}
		); 		
	}
		
	mainTable.addRow (topRow);

	files.sort (file_compare);
	for (let i = 0; i < files.length; i++) {
		let row = new UITableRow ();
		row.dismissOnSelect = false;

		row.onSelect = (idx) => { // idx is the index of the row being selected
			open_file (i);
		}

		let infoCell = row.addText (files[i].filename,
		                            "Total Pages: " + (files[i].pages).toString ());
		infoCell.widthWeight = 80;

		// We have an unlink/trash button instead of deletion.
		let ulBtn = row.addButton ("🗑️")
		ulBtn.widthWeight = 20;
		ulBtn.rightAligned ();
		ulBtn.onTap = () => {
			let a = new Alert ();
			a.title = "Are You Sure?";
			a.addCancelAction ("Proceed");
			a.addTextField ("Enter UNLINK to unlink").setEmailAddressKeyboard ();
			presentation = a.presentAlert ()
			presentation.then (
				function () {
					unlink_file (i, a.textFieldValue (0));
				},
				function () {}
			);
		}

		mainTable.addRow (row);
	}

}

// Present the table
function p_table (code) {
	update_main_table ();
	if (passCode == code) {
		mainTable.present (true);
	}
}

// ---
// Password protection, disabled by default
let passCode = "1234"
if (1 == 0) {
	let LoadWarning = new Alert ();
	LoadWarning.title = "Password";
	LoadWarning.addTextField ("Input the Password");
	LoadWarning.addAction ("Check");
	presentation = LoadWarning.present ();
	presentation.then (function () {
		p_table (LoadWarning.textFieldValue (0));
	});
} else {
	p_table (passCode);
}
