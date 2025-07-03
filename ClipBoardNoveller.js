// ClipBoardNoveller for Scriptable by Luke Li
// v1.0.18

// This program allows you to save novels you copied from your clipboard in pages,
// each page is a different text file, and the json file contains the list of main
// file which leads to all the text files.

// This is a largely re-written version of the previous script, but any file created
// should remain compatible.


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
files = []
if (fm.fileExists (lofPath)) {
	let raw = fm.readString (lofPath)
	files = JSON.parse (raw)
}
function save_files () {
	fm.writeString (lofPath,JSON.stringify (files));
}
// used to sort file by name
function file_compare (a, b) { 
	return a.filename > b.filename
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

// ---
// the display HTML a __textValue__ and __edited__ to enable editing
let overrideDisplayHTMLPath = "__OverrideDisplayHTML__";
let htmlDisplayIndex = file_name_search (overrideDisplayHTMLPath);
let htmlDisplayString = ""
if (htmlDisplayIndex != -1) { 
	let finalVersion = files[htmlDisplayIndex].pages;
	htmlDisplayString = fm.readString (get_path (htmlDisplayIndex, finalVersion));
	if (htmlDisplayString.indexOf ("__textContent__") < 0) { // incompatible
		htmlDisplayString = ""
	}
}
function evaluate_display_html (textContent) {
	encodedText = textContent.replace (/&/g, '&amp;')
	                         .replace (/</g, '&lt;')
	                         .replace (/>/g, '&gt;')
	                         .replace (/"/g, '&quot;')
	                         .replace (/'/g, '&#039;');
	htmlDoc = htmlDisplayString.replace ("__textContent__", encodedText);
	return htmlDoc;
}

// the gallery HTML must have an ODH_LoadFile function
let overrideGalleryHTMLPath = "__OverrideGalleryHTML__";
let htmlGalleryIndex = file_name_search (overrideGalleryHTMLPath);
let htmlGalleryPath = "";
if (htmlGalleryIndex != -1) { 
	let finalVersion = files[htmlGalleryIndex].pages;
	htmlVal = fm.readString (get_path (htmlGalleryIndex, finalVersion));
	if (htmlVal.indexOf ("ODH_LoadFile") >= 0) { // compatible
		htmlGalleryPath =
			fm.joinPath (dirPath, "/" + overrideGalleryHTMLPath + ".html");
		fm.writeString (htmlGalleryPath, htmlVal);
	}
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

async function edit_page (fileIndex, pageNum, newContent) {
	let pagePath = get_path (fileIndex, pageNum);

	if (get_file_suffix (pagePath) == "txt") { // text editing is supported
		textContent = fm.readString (pagePath);

		let a = new Alert ();
		a.title = "Confirm Editing?";
		// a crude comparison
		a.message = "Lengths: " +
			textContent.length.toString () +
			" -> " +
			newContent.length.toString ();
		a.addCancelAction ("Cancel");
		a.addAction ("Confirm");

		let result = await a.presentAlert ();

		if (result == 0) {
			fm.writeString (pagePath, newContent);		
		}
	}

	update_page_table (fileIndex);
	pageTable.reload ();
}

async function gallery_page (fileIndex, pageNum) {
	let pagePath = get_path (fileIndex, pageNum);

	if (htmlGalleryPath != "") {
		let galView = new WebView ();
		await galView.loadFile (htmlGalleryPath);

		let loadScript = "ODH_LoadFile(\'" + pagePath + "\')";
		await galView.evaluateJavaScript (loadScript);

		await galView.present ();
		}
	} else {
		let ql = QuickLook;
		ql.present (pagePath, true);
	}
}

async function display_page (fileIndex, pageNum) {
	let pagePath = get_path (fileIndex, pageNum);

	if (get_file_suffix (pagePath) == "txt" && htmlDisplayString != "") { // use html display
		textContent = fm.readString (pagePath);
		let editView = new WebView ();
		await editView.loadHTML (evaluate_display_html (textContent));

		await editView.present ();

		let resultString = await editView.evaluateJavaScript (
			`
			result = "__NaN__";
			if (__edited__)
				result = document.getElementById("taEditor").value;
			result
			`
		);

		if (resultString != "__NaN__") {
			edit_page (fileIndex, pageNum, resultString);
		}
	} else {
		let ql = QuickLook;
		ql.present (pagePath, true);
	}
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
	// Swap files
	fm.move (p1, nonsense);
	fm.move (p2, newP1);
	fm.move (nonsense, newP2);

	if (!files[fileIndex].hasOwnProperty ("hiddenPages")) {
		files[fileIndex]["hiddenPages"] = [];
	}

	// If either page has been hidden
	pageLoHidden = files[fileIndex].hiddenPages.indexOf (pageNum - 1);
	pageHiHidden = files[fileIndex].hiddenPages.indexOf (pageNum);
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
	topRow.backgroundColor = new Color ("2B2B2B",255);
	
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
		row.onSelect = (idx) => { 
			gallery_page (fileIndex, i);
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
		infoCell.widthWeight = 80;
	
		// For images, add an annotation button TODO
		/*
		if (get_file_suffix (filePath) == "png") {
			let anBtn = row.addButton ("📎"); // paper clip
			anBtn.widthWeight = 10;
			anBtn.leftAligned ();
			anBtn.onTap = () => {
				get_or_create_annotation (fileIndex, i);
			}
		}
		*/

		// we can edit texts; for legacy reasons it's called display
		if (get_file_suffix (filePath) == "txt") {
			let editBtn = row.addButton ("🖊️"); // pen
			editBtn.widthWeight = 10;
			editBtn.leftAligned ();
			editBtn.onTap = () => {
				display_page (fileIndex, i);
			}
		}

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
	topRow.backgroundColor = new Color ("2B2B2B",255);

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
