// The program allows you to save novels you copied from your clipboard in pages, each page is a different text file, and the json file contains the list of main file which leads to all the text files.

// Initialise the program
let fm = FileManager.local ();
let dirPath = fm.joinPath (fm.documentsDirectory (),"lktextreader");
// json file containing the list of file names
// Loads into an array of objects with attributes `filename`, `pages` 
// and optionally `hiddenPages[]`
let lofPath = fm.joinPath (dirPath,"/lof.json");  

// The default HTML display
let novelDisplayHTML = `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
<body>
<style>
body {
	background-color: #000000;
}
textarea {
	width: 30em;
	height: 50em;
	border: 2px solid #cccccc;
	padding: 5px;
	overflow: auto;
   -webkit-overflow-scrolling: touch;
	font-family: "Lucida Console", Monaco, monospace
}
</style>
<! textContent (with surrounding underscores)
will be replaced when evaluating -->
<textarea id="taEditor">__textContent__</textarea>
</body>
</html>`;
// Modify the file to override the display HTML
let overrideDisplayHTMLPath = "__OverrideDisplayHTML__";


// If the path does not exist, create one
if (!fm.fileExists(dirPath)){
	fm.createDirectory(dirPath);
}

// Initialise a table to display the files
let table = new UITable();
table.showSeparators = true;
UpdateTable(); // Update the list when the program starts

// Initialise a table to display all the pages in a file
let PageList = new UITable;
table.showSeparators = true;

let showHiddenPages = false; // Do not show hidden pages by default

// Password protection, disabled by default
if (1 == 0) {
	let LoadWarning = new Alert();
	LoadWarning.title = "Password";
	LoadWarning.addTextField ("Input the Password");
	LoadWarning.addAction ("Check");
	presentation = LoadWarning.present ();
	presentation.then (function () {
		PTable (LoadWarning.textFieldValue (0));
	});
} else {
	table.present (true)
}

// Present the table
function PTable (code) {
	if ("1234" == code) {
		table.present (true);
	}
}

// Updates the table with files in lof
function UpdateTable () {
	table.removeAllRows ();  // remove all the previous contents
	
	toprow = new UITableRow (); // the top row with options
	toprow.isHeader = true;
	toprow.backgroundColor = new Color ("2B2B2B",255);

	let RefBtn = toprow.addButton ("🔄"); // Refresh button
	RefBtn.widthWeight = 20;
	RefBtn.onTap = () => {
		UpdateTable ();
		table.reload ();
	}
	
	let HeadTitle = toprow.addText ("Menu");
	HeadTitle.widthWeight = 60;
	HeadTitle.centerAligned ();
	
	let NewBtn = toprow.addButton ("📂"); // A button with a file on it
	NewBtn.widthWeight = 20;
	NewBtn.rightAligned ();
	NewBtn.onTap = () => {
		let a = new Alert ();
		a.title = "File Name";
		a.addTextField ("file name").setEmailAddressKeyboard ();
		a.addCancelAction ("Confirm");
		presentation = a.presentAlert ()
		// Only proceed after the file name has been inputted
		presentation.then (
			function () {
				CreateFile (a.textFieldValue (0));
			}, 
			function () {}
		); 		
	}
		
	table.addRow (toprow);
	
	
	let files = LoadFiles (); // load all the files into an Array of Objects
	files.sort (FileCompare);
	for (i = 0; i < files.length; i++){
		let ThisFile = files[i];
		let row = new UITableRow ();
		row.dismissOnSelect = false; // don't close the table when a row is selected
		
		row.onSelect = (idx) => { // idx is the index of the row being selected
			OpenFile (ThisFile);
		}
		
		// display the file name
		let InfoCell = row.addText (ThisFile.filename, 
			                    "Total Pages: " + (ThisFile.pages).toString ());
		InfoCell.widthWeight = 80;
		
		// button to delete the file 
		let DelBtn = row.addButton ("❌"); // A button with a cross on it
		DelBtn.widthWeight = 20;
		DelBtn.rightAligned ();
		DelBtn.onTap = () => {
			let a = new Alert ();
			a.title = "Are You Sure?";
			a.addCancelAction ("Proceed");
			a.addTextField ("Enter DELETE for deletion").setEmailAddressKeyboard ();
			presentation = a.presentAlert ()
			presentation.then (
				function () {
					DeleteFile (ThisFile, a.textFieldValue (0));
				},
				function () {} 
			); 	
		}

		table.addRow (row);
	}
}

// File manipulation functions
function CreateFile (filename) {
	// Only proceed if the filename is legal
	if (filename != ""){
		let files = LoadFiles ();
		let NewFile = {"filename":filename, "pages":0};
		files.push (NewFile);
		SaveFiles (files);
	}
	UpdateTable ();
	table.reload ();
}

function DeleteFile (ThisFile, confirmation) {
	//only proceed if confirmation is entered
	if (confirmation == "DELETE") {
		let files = LoadFiles ();
		// Filter the file that has an identical filename to ThisFile
		files = files.filter (t => {
			return t.filename != ThisFile.filename;
		}); 
		SaveFiles (files);
		// Delete all the pages of the file
		for (i = 1; i <= ThisFile.pages; i++){
			// Get the file name dirPath/filenameI.txt
			PagePath = GetPath (ThisFile, i);
			fm.remove (PagePath);
		}	
	}
	UpdateTable ();
	table.reload ();
}

function LoadFiles () {	// load all the files into an Array of Objects
	if (fm.fileExists (lofPath)) {
		// lofpath initialised at the start
		let raw = fm.readString (lofPath)
		return JSON.parse (raw)
	}else{
		return []
	}	
}

function SaveFiles (files) {
	fm.writeString (lofPath,JSON.stringify(files));
}

// Used to sort file by name
function FileCompare (a, b) { 
	return a.filename > b.filename
}

// Opening a file
function OpenFile(ThisFile) {
	PageList.reload ();
	UpdatePageList (ThisFile);
	PageList.present (true);
}

function UpdatePageList (ThisFile) {
	PageList.removeAllRows ();  //remove all the previous contents

	let toprow = new UITableRow (); //the top row with options to add new pages
	toprow.isHeader = true;
	toprow.backgroundColor = new Color ("2B2B2B",255);
	
	let BckBtn = toprow.addButton ("⬅"); //Right Arrow
	BckBtn.widthWeight = 20;
	BckBtn.dismissOnTap = true;
	BckBtn.onTap = () => {
		UpdateTable ();
		table.reload ();
	}
	
	let HeadTitle = toprow.addText ("Menu");
	HeadTitle.widthWeight = 40;
	HeadTitle.centerAligned ()
	
	let NewBtn = toprow.addButton ("📃"); // A button with a page on it
	NewBtn.widthWeight = 20;
	NewBtn.onTap = () => {
		AddPage (ThisFile, "txt");
	}
	NewBtn.rightAligned ();
	
	let NewPicBtn = toprow.addButton ("🖼️"); // A button with a picture on it
	NewPicBtn.widthWeight = 20;
	NewPicBtn.onTap = () => {
		AddPage (ThisFile, "img");
	}
	NewPicBtn.rightAligned ();
	
	let ShowHiddenBtn = toprow.addButton ("😐"); // Indicates "unhide"
	ShowHiddenBtn.widthWeight = 20;
	ShowHiddenBtn.onTap = () => {
		showHiddenPages = !showHiddenPages;
		UpdatePageList (ThisFile);
		PageList.reload ();
	}
	ShowHiddenBtn.rightAligned ();

	PageList.addRow (toprow);	

	for (let i = 1; i <= ThisFile.pages; i++) {
		// Do not display hidden pages, if such feature were enabled
		if (ThisFile.hasOwnProperty ("hiddenPages")) {
			if (ThisFile.hiddenPages.includes (i)) {
				if (!showHiddenPages) {
					continue;
				}
			}
		}

		let row = new UITableRow ();
		
		row.dismissOnSelect = false; //don't close the table when a row is selected
		row.height = 60;
		
		row.onSelect = (idx) => { 
			OpenPage (ThisFile, i);
		}

		let filePath = GetPath (ThisFile, i);
		let preview = "No Preview";
		if (GetFileSuffix (filePath) == "txt") {
			preview = fm.readString (filePath).slice (0,40).replaceAll (/\s/g, ' ');
		} else if (GetFileSuffix (filePath) == "png") {
			preview = "image";
		}
		
		let InfoCell = row.addText ("Page: " + i.toString (), preview);
		InfoCell.widthWeight = 80;

		let UpBtn = row.addButton ("🔼"); // Up button
		UpBtn.widthWeight = 20;
		UpBtn.rightAligned ();
		UpBtn.onTap = () => {
			MovePageUp (ThisFile, i);
		}

		// Actually a toggle hide button
		let HideBtn = row.addButton ("🫥"); // This means 'hide' I suppose 
		HideBtn.widthWeight = 20;
		HideBtn.rightAligned ();
		HideBtn.onTap = () => {
			ToggleHidePage (ThisFile, i);
		}

		PageList.addRow (row);
	}
}

// Grab an image from either the text or image pasteboard
async function AddPage (ThisFile, fileType) {
	var content;
	if (fileType == "txt") {
		content = Pasteboard.paste ();
	} else if (fileType == "img") {
		content = Pasteboard.pasteImage();
	}

	if (content == null) {
		return;
	}

	let files = LoadFiles (); // Load LOF to update the page numbers
	let i = ThisFile.pages + 1; // Page number for the new page

	let a = new Alert ();
	a.title = "Confirm Adding?";
	if (fileType == "txt") {
		a.message = content; // Provide the clipboard as a sample
	} else {
		a.message = "Preview not Available";
	}
	a.addCancelAction ("Cancel");
	a.addAction ("Confirm");
	
	let result = await a.presentAlert ();
	
	if (result == 0) {
		// Linear search to update the json file
		for (c = 0; c < files.length; c++){
			file = files[c];
			if (file.filename == ThisFile.filename) {
				files[c].pages = files[c].pages + 1;
				break;
			}	
		}
		SaveFiles (files);
		ThisFile.pages ++; // Add 1 to the pages in ThisFile to update the menu
		
		// Get the file name dirPath/filenameI.txt or png
		let PagePath = fm.joinPath (dirPath, 
			                    "/" + ThisFile.filename + i.toString ());
		if (fileType == "txt") {
			PagePath = PagePath + ".txt";
			fm.writeString (PagePath, content);
		} else if (fileType == "img") {
			PagePath = PagePath + ".png";
			fm.writeImage (PagePath, content);
		}

		
		UpdatePageList (ThisFile);
		PageList.reload ();
	}
}

function ToggleHidePage (ThisFile, PageNum) {
	
	let files = LoadFiles ();

	for (c = 0; c < files.length; c++) {
		if (files[c].filename == ThisFile.filename) {
			// Create this attribute if it did not exist for backwards compatibility
			if (!files[c].hasOwnProperty ("hiddenPages")) {
				files[c]["hiddenPages"] = [];
			}

			// Toggle
			if (files[c].hiddenPages.includes (PageNum)) {
				RemovePageNumFromArray (files[c].hiddenPages, PageNum);
			} else {
				files[c].hiddenPages.push (PageNum);
			}

			break;
		}
	}
	SaveFiles(files);

	// Update the loaded copy as well
	ThisFile["hiddenPages"] = files[c].hiddenPages;

	UpdatePageList (ThisFile);
	PageList.reload ();
}

function MovePageUp (ThisFile, PageNum) {
	if (PageNum <= 1) { // Do nothing for exceptions and the first page
		return;
	}
	
	let p1 = GetPath (ThisFile, PageNum - 1);
	let p2 = GetPath (ThisFile, PageNum);

	let newP1 = p1;
	let newP2 = p2;
	if (GetFileSuffix (p1) != GetFileSuffix (p2)) {
		newP1 = SwapFileSuffix (p1, GetFileSuffix (p2));
		newP2 = SwapFileSuffix (p2, GetFileSuffix (p1));
	}

	// Cannot be bordered with random string generation
	let nonsense = p1 + "_oreetdoloremagnaalisnostcitationullamc";
	// Swap files
	fm.move (p1, nonsense);
	fm.move (p2, newP1);
	fm.move (nonsense, newP2);

	UpdatePageList (ThisFile);
	PageList.reload ();
}

function GetPath (ThisFile, PageNum) {
	let path = fm.joinPath (dirPath, "/" + ThisFile.filename + PageNum.toString ());

	if (fm.fileExists (path + ".txt")) {
		return path + ".txt";	
	}
	if (fm.fileExists (path + ".png")) {
		return path + ".png";	
	}
}

async function OpenPage (ThisFile, index) {
	let PagePath = GetPath (ThisFile, index);
	if (GetFileSuffix (PagePath) == "txt") {

		textContent = fm.readString (PagePath);

		let editView = new WebView ();
		editView.loadHTML (EvaluateDisplayHTML (textContent));

		await editView.present ();

		let resultString = await editView.evaluateJavaScript (`document.getElementById("taEditor").value`);

		log (resultString);
	} else {
		let ql = QuickLook;
		ql.present (PagePath, true);
	}

}

function RemovePageNumFromArray (Arr, PageNum) {
	let end = Arr.pop();
	if (Arr[Arr.length] != PageNum) { // PageNum not the end, insert it back
		let p = Arr.indexOf(PageNum);
		if (p != -1) {
			Arr[p] = end;
		}
	}
}

function GetFileSuffix (filePath) {
	// Split the file path by periods to separate the suffix
	let parts = filePath.split ('.');
	
	// Check if there is a suffix present
	if (parts.length > 1) {
		// Return the last part as the suffix
		return parts.pop ();
	}
	
	// If no suffix is found, return an empty string or null
	return '';
}

function SwapFileSuffix (filePath, newSuffix) {
	// Find the last period in the file path
	const lastDotIndex = filePath.lastIndexOf ('.');
	
	// If there is no period, return the file path with the new suffix appended
	if (lastDotIndex === -1) {
		return filePath + '.' + newSuffix;
	}
	
	// Return the file path with the suffix replaced
	return filePath.substring (0, lastDotIndex + 1) + newSuffix;
}

// To facilitate the edit of files, we shall use the sin that is HTML

async function EditPage (ThisFile, index) {
}

// Load the proper HTML script and
// replace the __textContent__ in the display script
function EvaluateDisplayHTML (textContent) {
	let files = LoadFiles ();

	p = ""
	for (c = 0; c < files.length; c++) {
		// Where the script is
		if (files[c].name == overrideDisplayHTMLPath) {
			p = GetPath (files[c], 1);
		}
	}

	html = novelDisplayHTML;
	if (p != "") {
		html = fm.readString (p);
	}

	html = html.replace ("__textContent__", textContent);
	return html;
}

















