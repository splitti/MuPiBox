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
imageList['blue'] = new Image(150, 250);
imageList['blue'].src = "images/blue.png";
imageList['deepblue'] = new Image(150, 250);
imageList['deepblue'].src = "images/deepblue.png";
imageList['purple'] = new Image(150, 250);
imageList['purple'].src = "images/purple.png";
imageList['pink'] = new Image(150, 250);
imageList['pink'].src = "images/pink.png";
imageList['green'] = new Image(150, 250);
imageList['green'].src = "images/green.png";
imageList['red'] = new Image(150, 250);
imageList['red'].src = "images/red.png";
imageList['orange'] = new Image(150, 250);
imageList['orange'].src = "images/orange.png";
imageList['chocolate'] = new Image(150, 250);
imageList['chocolate'].src = "images/chocolate.png";
imageList['vintage'] = new Image(150, 250);
imageList['vintage'].src = "images/vintage.png";
imageList['dark'] = new Image(150, 250);
imageList['dark'].src = "images/dark.png";
imageList['light'] = new Image(150, 250);
imageList['light'].src = "images/light.png";


function switchImage() {
    var selectedImage = document.mupi.theme.options[document.mupi.theme.selectedIndex].value;
    document.selectedTheme.src = imageList[selectedImage].src;
}