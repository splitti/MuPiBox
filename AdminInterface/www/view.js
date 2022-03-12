/* Toggle between adding and removing the "responsive" class to topnav when the user clicks on the icon */
function myFunction() {
  var x = document.getElementById("myTopnav");
  if (x.className === "topnav") {
    x.className += " responsive";
  } else {
    x.className = "topnav";
  }
}

$(document).ready(function(){
  $("#form").on("submit", function(){
    $("#loading-circle").fadeIn();
    $("#lock-modal").fadeIn('slow');
  });//submit
});//document ready

// This is the code to preload the images
var imageList = Array();
imageList[blue] = new Image(150, 250);
imageList[blue].src = "images/blue.png";
imageList[deepblue] = new Image(150, 250);
imageList[deepblue].src = "images/deepblue.png";
imageList[red] = new Image(150, 250);
imageList[red].src = "images/red.png";
imageList[3] = new Image(150, 250);
imageList[3].src = "images/blue.png";
imageList[4] = new Image(150, 250);
imageList[4].src = "images/blue.png";
imageList[5] = new Image(150, 250);
imageList[5].src = "images/blue.png";
imageList[6] = new Image(150, 250);
imageList[6].src = "images/blue.png";
imageList[7] = new Image(150, 250);
imageList[7].src = "images/blue.png";
imageList[8] = new Image(150, 250);
imageList[8].src = "images/blue.png";
imageList[9] = new Image(150, 250);
imageList[9].src = "images/blue.png";
imageList[10] = new Image(150, 250);
imageList[10].src = "images/blue.png";


function switchImage() {
    var selectedImage = document.theme.switch.options[document.theme.switch.selectedIndex].value;
    document.selectedTheme.src = imageList[selectedImage].src;;
}