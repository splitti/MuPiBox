<?php
	$str_data = file_get_contents('/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json', true);
	$data_json = json_decode($str_data, true);
	include ('includes/header.php');

/*	if (isset($_SESSION['LAST_ACTIVITY']) && (time() - $_SESSION['LAST_ACTIVITY'] > 3580)) {
		$_SESSION['spotify_bearer']="";
		// last request was more than 30 minutes ago
		session_unset();     // unset $_SESSION variable for the run-time 
		session_destroy();   // destroy session data in storage
		setcookie("PHPSESSID", "", 1);
		}
*/

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL,            'https://accounts.spotify.com/api/token' );
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1 );
		curl_setopt($ch, CURLOPT_POST,           1 );
		curl_setopt($ch, CURLOPT_POSTFIELDS,     'grant_type=client_credentials' ); 
		curl_setopt($ch, CURLOPT_HTTPHEADER,     array('Authorization: Basic '.base64_encode($data["spotify"]["clientId"].':'.$data["spotify"]["clientSecret"]))); 

		$result=curl_exec($ch);
		curl_close($ch);
		
		$bearer_json = json_decode($result, true);
?>
<div class="main">
<h2>MuPiBox - Media</h2>
<p>The contents of the media database are displayed here.</p>
</div>
<?php
	foreach($data_json as $all_media)
		{

			$url2media = "";
			if( $all_media['type'] == "spotify" )
				{
				if( $all_media['artistid'] != "" )
					{
					$url2media = "https://open.spotify.com/artist/".$all_media['artistid'];
					$spotifyURL = "https://api.spotify.com/v1/artists/" . $all_media['artistid'] . "/top-tracks?market=DE";
					$spotifyURL = "https://api.spotify.com/v1/artists/" . $all_media['artistid'];
					$authorization = 'Authorization: Bearer '.$bearer_json['access_token'];
					$ch = curl_init();
					curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json' , $authorization ));
					curl_setopt($ch, CURLOPT_URL, $spotifyURL);
					curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
					curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:x.x.x) Gecko/20041107 Firefox/x.x");
					curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
					curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
					$json = curl_exec($ch);
					$json = json_decode($json, true);
					curl_close($ch);
					$img_http=$json['images'][1]['url'];
					//$img_http=$json['tracks'][0]['album']['images'][1]['url'];
					}
				if( $all_media['id'] != "" )
					{
					if( $all_media['category'] == "playlist" )
						{
						$url2media = "https://open.spotify.com/playlist/".$all_media['id'];
						$spotifyURL = "https://api.spotify.com/v1/playlists/" . $all_media['id'] . "/images";
						$authorization = 'Authorization: Bearer '.$bearer_json['access_token'];
						$ch = curl_init();
						curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json' , $authorization ));
						curl_setopt($ch, CURLOPT_URL, $spotifyURL);
						curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
						curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:x.x.x) Gecko/20041107 Firefox/x.x");
						curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
						curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
						$json = curl_exec($ch);
						$json = json_decode($json, true);
						curl_close($ch);
						$img_http=$json[0]['url'];
						}
					if( $all_media['category'] == "music" )
						{
						$url2media = "http://open.spotify.com/album/".$all_media['id'];
						$spotifyURL = "https://api.spotify.com/v1/albums/" . $all_media['id'];
						$authorization = 'Authorization: Bearer '.$bearer_json['access_token'];
						$ch = curl_init();
						curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json' , $authorization ));
						curl_setopt($ch, CURLOPT_URL, $spotifyURL);
						curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
						curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:x.x.x) Gecko/20041107 Firefox/x.x");
						curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
						curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
						$json = curl_exec($ch);
						$json = json_decode($json, true);
						curl_close($ch);
						$img_http=$json['images'][1]['url'];
						}
					if( $all_media['category'] == "audiobook" )
						{
						$url2media = "http://open.spotify.com/album/".$all_media['id'];
						$spotifyURL = "https://api.spotify.com/v1/albums/" . $all_media['id'];
						$authorization = 'Authorization: Bearer '.$bearer_json['access_token'];
						$ch = curl_init();
						curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json' , $authorization ));
						curl_setopt($ch, CURLOPT_URL, $spotifyURL);
						curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
						curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:x.x.x) Gecko/20041107 Firefox/x.x");
						curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
						curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
						$json = curl_exec($ch);
						$json = json_decode($json, true);
						curl_close($ch);
						$img_http=$json['images'][1]['url'];
						}
					}
				if( $all_media['showid'] != "" )
					{
					$url2media = "http://open.spotify.com/show/" . $all_media['showid'];
					$spotifyURL = "https://api.spotify.com/v1/shows/" . $all_media['showid'] . "?market=DE";
					$authorization = 'Authorization: Bearer '.$bearer_json['access_token'];
					$ch = curl_init();
					curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json' , $authorization ));
					curl_setopt($ch, CURLOPT_URL, $spotifyURL);
					curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
					curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:x.x.x) Gecko/20041107 Firefox/x.x");
					curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
					curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
					$json = curl_exec($ch);
					$json = json_decode($json, true);
					curl_close($ch);
					$img_http=$json['images'][1]['url'];
					}
				if( $all_media['query'] != "" )
					{
					$url2media = "https://open.spotify.com/search/" . rawurlencode($all_media['query']);
					//Search Query
					$spotifyURL = 'https://api.spotify.com/v1/search?q=' . rawurlencode($all_media['query']) . '&type=album&limit=1';
					$authorization = 'Authorization: Bearer '.$bearer_json['access_token'];
					$ch = curl_init();
					curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json' , $authorization ));
					curl_setopt($ch, CURLOPT_URL, $spotifyURL);
					curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
					curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:x.x.x) Gecko/20041107 Firefox/x.x");
					curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
					curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
					$json = curl_exec($ch);
					$json = json_decode($json, true);
					curl_close($ch);
					$img_http=$json['albums']['items'][0]['images'][1]['url'];
					}
				//$str_mediadata = get_remote_data($oembedURL);
				//$data_mediajson = json_decode($str_mediadata, true);
				//$img_http = $data_mediajson['thumbnail_url'];
				//$spotiy_artist = $data_mediajson['title'];
				}

			print "<div id='flex-container'>";
			print "<div class='media_img'>";
			print "<img width='150' style='width:150px;min-width:150px;max-width:150px;' src='";
			if( $all_media['type'] == "library" )
				{
				 print $all_media['cover'];
				}
			if( $all_media['type'] == "radio" )
				{
				print $all_media['cover'];
				}
			if( $all_media['type'] == "spotify" )
				{
				if( $img_http )
					{
					print $img_http;
					$img_http = "";
					}
				else
					{
					print "./images/empty.png";
					}
				}
			print "'></div><div class='media_txt'>";
			print "<table><tr><td width='80px'>Index:</td><td>" . $all_media['index'] . "</td></tr>";
			print "<tr><td>Type:</td><td>" . $all_media['type'] . "</td></tr>";
			print "<tr><td>Category:</td><td>" . $all_media['category'] . "</td></tr>";
			if($all_media['artist'])
				{
				print "<tr><td>Artist:</td><td>" . $all_media['artist'] . "</td></tr>";
				}
			if($all_media['title'])
				{
				print "<tr><td>Title:</td><td>" . $all_media['title'] . "</td></tr>";
				}
			if($all_media['id'])
				{
				if($all_media['category'] == "radio")
					{
					print "<tr><td>ID:</td><td><a href='" . $all_media['id'] . "' target='_blank'>" . $all_media['id'] . "</a></td></tr>";
					}
				else
					{
					print "<tr><td>ID:</td><td>" . $all_media['id'] . "</td></tr>";
					}
				}
			if($all_media['artistid'])
				{
				print "<tr><td>ID:</td><td>" . $all_media['artistid'] . "</td></tr>";
				}
			if($all_media['showid'])
				{
				print "<tr><td>ID:</td><td>" . $all_media['ShowID'] . "</td></tr>";
				}
			if($all_media['query'])
				{
				print "<tr><td>Search query:</td><td>" . $all_media['query'] . "</td></tr>";
				}
			if($all_media['shuffle'])
				{
				print "<tr><td>Shuffle:</td><td>" . $all_media['shuffle'] . "</td></tr>";
				}
			if($all_media['cover'])
				{
				print "<tr><td>Cover-URL:</td><td><a href='" . $all_media['cover'] . "' target='_blank'>" . $all_media['cover'] . "</a></td></tr>";
				}
			if($url2media)
				{
				print "<tr><td>Spotify:</td><td><a href='" . $url2media . "' target='_blank'>" . $url2media .  "</a></td></tr>";
				}
			print "</table></div>\n";
			//print "URL: " . $all_media['type'] . "<br>";

			print "</div><hr style='margin:0;padding:0;border:0;height:3px;background-image:linear-gradient(to right, rgba(0, 0, 0, 0), rgba(9, 84, 132), rgba(0, 0, 0, 0));'>";
		}
 include ('includes/footer.php');
?>
