
<?php
	include ('includes/header.html');
	$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
	$data = json_decode($string, true);
?>
        <img id="top" src="top.png" alt="">
        <div id="form_container">
                <h1><a>MuPiBox Configuration</a></h1>
                <form id="form_37271" class="appnitro"  method="post" action="">
                                        <div class="form_description">
                        <h2>General settings</h2>
                        <p>This is the central configuration of your MuPiBox...</p>
                </div>
                        <ul >

                                        <li class="buttons">
                            <input type="hidden" name="form_id" value="37271" />

                                <input id="saveForm" class="button_text" type="submit" name="submit" value="Submit" />
                </li>


                        </ul>
                </form>
        </div>
        <img id="bottom" src="bottom.png" alt="">

        </body>
</html>
