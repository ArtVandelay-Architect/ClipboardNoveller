//The program allows you to save novels you copied from your clipboard in pages, each page is a different text file, and the json file contains the list of main file which leads to all the text files.

//Initialise the program
let fm = FileManager.local();
let dirPath = fm.joinPath(fm.documentsDirectory(),"lktextreader");
let lofPath = fm.joinPath(dirPath,"/lof.json");  
//json file containing the list of file names

//if the path does not exist, create one
if (!fm.fileExists(dirPath)){
	fm.createDirectory(dirPath);
}

//Initialise a table to display to files
let table = new UITable();
table.showSeparators = true;
UpdateTable(); //Update the list when the program starts

//Loading system
let LoadWarning = new Alert();
LoadWarning.title = "Loading..";
LoadWarning.addTextField("This could take a few seconds");
LoadWarning.addAction("Cancel");
presentation = LoadWarning.present();
presentation.then(function(){PTable(LoadWarning.textFieldValue(0));});


//Initialise a table to display all the pages in a file
let PageList = new UITable;
table.showSeparators = true;

//Present the table
function PTable(code){
	if (code == "CANCEL"){
	table.present(true);}
}

//Updates the table with files in lof
function UpdateTable(){
	table.removeAllRows();  //remove all the previous contents
	
	toprow = new UITableRow(); //the top row with options
	toprow.isHeader = true;
	toprow.backgroundColor = new Color("2B2B2B",255);

	let RefBtn = toprow.addButton("🔄"); //Refresh button
	RefBtn.widthWeight = 20;
	RefBtn.onTap = () => {
		UpdateTable();
		table.reload();
	}
	
	let HeadTitle = toprow.addText("Menu");
	HeadTitle.widthWeight = 60;
	HeadTitle.centerAligned();
	
	let NewBtn = toprow.addButton("📂"); //A button with a file on it
	NewBtn.widthWeight = 20;
	NewBtn.rightAligned();
	NewBtn.onTap = () => {
		let a = new Alert();
		a.title = "File Name";
		a.addTextField("file name").setEmailAddressKeyboard();
		a.addCancelAction("Confirm");
		presentation = a.presentAlert()
		//Only proceed after the file name has been inputted
		presentation.then(function(){CreateFile(a.textFieldValue(0));},function(){}); 		
	}
		
	table.addRow(toprow);
	
	
	let files = LoadFiles(); //load all the files into an Array of Objects
	files.sort(FileCompare);
	for (i=0;i<files.length;i++){
		let ThisFile = files[i];
		let row = new UITableRow();
		row.dismissOnSelect = false; //don't close the table when a row is selected
		
		row.onSelect = (idx) => { //idx is the index of the row being selected
			//let ThisFile = files[idx-1]; //pick the file object in the array, since there is a header row, minus 1 in index
			OpenFile(ThisFile);
		}
		
		//display the file name
		let InfoCell = row.addText(ThisFile.filename,"Total Pages: " + (ThisFile.pages).toString());
		InfoCell.widthWeight = 80;
		//button to delete the file 
		let DelBtn = row.addButton("❌"); //A button with a cross on it
		DelBtn.widthWeight = 20;
		DelBtn.rightAligned();
	    DelBtn.onTap = () => {
		let a = new Alert();
			a.title = "Are You Sure?";
			a.addCancelAction("Proceed");
			a.addTextField("Enter DELETE for deletion").setEmailAddressKeyboard();
			presentation = a.presentAlert()
			presentation.then(function(){DeleteFile(ThisFile,a.textFieldValue(0));},function(){}); 	
		}
		table.addRow(row);
	}
}

//File manipulation functions
function CreateFile(filename){
	//Only proceed if the filename is legal
	if (filename != ""){
		let files = LoadFiles();
		let NewFile = {"filename":filename,"pages":0};
		files.push(NewFile);
		SaveFiles(files);
	}
	UpdateTable();
	table.reload();
}

function DeleteFile(ThisFile,confirmation){
	//only proceed if confirmation is entered
	if (confirmation == "DELETE"){
		let files = LoadFiles();
		//Filter the file that has an identical filename to ThisFile
		files = files.filter(t => {return t.filename != ThisFile.filename;}); 
		SaveFiles(files);
		//Delete all the pages of the file
		for (i=1;i<=ThisFile.pages;i++){
			//Get the file name dirPath/filenameI.txt
			PagePath = GetPath(ThisFile,i);
			//log(PagePath);
			fm.remove(PagePath);
		}	
	}
	UpdateTable();
	table.reload();
}

function LoadFiles(){	//load all the files into an Array of Objects
	if (fm.fileExists(lofPath)) {
		//lofpath initialised at the start
		let raw = fm.readString(lofPath)
		return JSON.parse(raw)
	}else{
		return []
	}	
}

function SaveFiles(files){
	fm.writeString(lofPath,JSON.stringify(files));
}

//Used to sort file by name
function FileCompare(a,b){ 
	return a.filename < b.filename
}

//Opening a file
function OpenFile(ThisFile){	
	PageList.reload();
	UpdatePageList(ThisFile);
	PageList.present(true);
}

function UpdatePageList(ThisFile){
	PageList.removeAllRows();  //remove all the previous contents

	let toprow = new UITableRow(); //the top row with options to add new pages
	toprow.isHeader = true;
	toprow.backgroundColor = new Color("2B2B2B",255);
	
	let BckBtn = toprow.addButton("⬅"); //Right Arrow
	BckBtn.widthWeight = 20;
	BckBtn.dismissOnTap = true;
	BckBtn.onTap = () => {
		UpdateTable();
		table.reload();
	}
	
	let HeadTitle = toprow.addText("Menu");
	HeadTitle.widthWeight = 40;
	HeadTitle.centerAligned()
	
	let NewBtn = toprow.addButton("📃"); //A button with a page on it
	NewBtn.widthWeight = 20;
	NewBtn.onTap = () => {
		AddPage(ThisFile);
	}
	NewBtn.rightAligned();
	
	PageList.addRow(toprow);	

	for (i=1;i<=ThisFile.pages;i++) {
		let row = new UITableRow();
		
		row.dismissOnSelect = false; //don't close the table when a row is selected
		
		row.onSelect = (idx) => { //idx is the index of the row being selected
			OpenPage(ThisFile,idx);
		}

		let preview = fm.readString(GetPath(ThisFile,i)).slice(0,40);
		
		let InfoCell = row.addText("Page: " + i.toString(), preview);
		InfoCell.widthWeight = 80;
		PageList.addRow(row);
	}
}

async function AddPage(ThisFile){
	let files = LoadFiles(); //Load LOF to update the page numbers
	let i = ThisFile.pages + 1; //Page number for the new page
	//let content = ContentPrompt();
	let content = Pasteboard.paste();

	let a = new Alert();
	a.title = "Confirm Adding?";
	a.message = content; //Provide the clipboard as a sample
	a.addCancelAction("Cancel");
	a.addAction("Confirm");
	
	let result = await a.presentAlert();
	
	if (result == 0) {
		
		//Linear search to update the json file
		for (c=0;c<files.length;c++){
			file = files[c];
			if (file.filename == ThisFile.filename){
				files[c].pages = files[c].pages + 1;
				break;
			}	
		}
		SaveFiles(files);
		
		//Get the file name dirPath/filenameI.txt
		let PagePath = GetPath(ThisFile,i);
		fm.writeString(PagePath,content);
		
		ThisFile.pages ++; //Add 1 to the pages in ThisFile to update the menu
		
		UpdatePageList(ThisFile);
		PageList.reload();
	}
}


function GetPath(ThisFile,PageNum){
	return fm.joinPath(dirPath, "/" + ThisFile.filename + PageNum.toString() + ".txt");
}	

function OpenPage(ThisFile,index) {
	let PagePath = GetPath(ThisFile,index);
	let ql = QuickLook;
	ql.present(PagePath,true);
}
	