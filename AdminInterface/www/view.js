$(document).ready(function(){
    if (window.location.hash && ~modals.indexOf(window.location.hash)) {
        $(window.location.hash).modal();
    }
    $(".modal:not(.noclose)").on("click","a",function(){
        $(this).closest(".modal").modal("hide");
    });

    var currentTimestamp = Date.now();

    $("#ModalCenter").on("hidden.bs.modal", function () {
        localStorage.setItem("last-showed-at", currentTimestamp);
    });

    // Check for modal eligibility
    var showAgainInMs = 86400000;
    var lastTimestamp = Number(localStorage.getItem("last-showed-at"));

    if ((currentTimestamp - lastTimestamp) >= showAgainInMs) {
        setTimeout(function() {
            localStorage.setItem("last-showed-at", currentTimestamp);
            $("#ModalCenter").modal("show");
        }, 3000);
    }
});

$('#reset-session').on('click',function(){
  localStorage.clear();
});



lightBoxClose = function() {
  document.querySelector(".lightbox").classList.add("closed");
}

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
        $('#remform').on("submit", function(){
        $("#mupif").fadeIn();
        $("#loading-circle").fadeIn();
	$("#lock-modal").fadeIn('slow');
        });
});


$(document).ready(function(){
        $('#loading').click(function(){
        $("#mupif").fadeIn();
        $("#loading-circle").fadeIn();
		$("#lock-modal").fadeIn('slow');
        });
});


$(document).ready(function(){
	$("#form").on("submit", function(){
	$("#mupif").fadeIn();
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
imageList['darkred'] = new Image(150, 250);
imageList['darkred'].src = "images/darkred.png";
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
