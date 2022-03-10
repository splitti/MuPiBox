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
