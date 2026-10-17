-- Apply: inserts section.md as an H3 at the end of "## 5. Entertainment Beyond the Water".
-- Applies only if the row is byte-identical to before.md (md5 9f55...) and only if the
-- result is byte-identical to after.md (md5 be8d...). Expect exactly 1 row returned.
update public.blog_posts
set content = replace(content, E'\n\n## Frequently Asked Questions (FAQ)\n', E'\n\n' || $sec$### Planning a Larger Celebration With Several Kinds of Entertainment

Milestone birthdays, family reunions, graduation parties and company picnics often call for more than one kind of entertainment. A little extra planning keeps each piece in the right place.

*   **Your Pool as the Venue:** A private pool rental gives your group a place to swim and gather without sharing the space with the public. Before adding anything else, message the host to confirm the guest limit, parking, and whether outside vendors or equipment are allowed.
*   **Match Attractions to the Space:** The lawn games and photo wall above fit most backyard pools. Carnival rides need open, firm and reasonably level ground, clearance around and above each ride, truck access for delivery and often a power supply, so they are not something to bring to a typical backyard pool rental. They suit parks, fairgrounds, school grounds or dedicated event spaces.
*   **Book Rides Separately:** For a suitably sized event at one of those venues, [Carnival Ride Rental](https://carnivalriderental.us/) is a directory that connects event organizers with carnival ride operators. Confirm availability, setup and teardown times, and any permits with the operator and the venue before you announce rides to guests.
*   **One Shared Schedule:** If your celebration spans more than one place, such as rides at a park on Saturday and a smaller family swim at a rental pool on Sunday afternoon, give guests a single timeline with each address and start time, and keep the pool guest list within the listing's limit.$sec$ || E'\n\n## Frequently Asked Questions (FAQ)\n')
where id = '4896391d-5f21-457f-bedb-2c9b5a4b7f5f'
  and md5(content) = '9f550652a68aa3f808f7f294da60e70b'
  and md5(replace(content, E'\n\n## Frequently Asked Questions (FAQ)\n', E'\n\n' || $sec$### Planning a Larger Celebration With Several Kinds of Entertainment

Milestone birthdays, family reunions, graduation parties and company picnics often call for more than one kind of entertainment. A little extra planning keeps each piece in the right place.

*   **Your Pool as the Venue:** A private pool rental gives your group a place to swim and gather without sharing the space with the public. Before adding anything else, message the host to confirm the guest limit, parking, and whether outside vendors or equipment are allowed.
*   **Match Attractions to the Space:** The lawn games and photo wall above fit most backyard pools. Carnival rides need open, firm and reasonably level ground, clearance around and above each ride, truck access for delivery and often a power supply, so they are not something to bring to a typical backyard pool rental. They suit parks, fairgrounds, school grounds or dedicated event spaces.
*   **Book Rides Separately:** For a suitably sized event at one of those venues, [Carnival Ride Rental](https://carnivalriderental.us/) is a directory that connects event organizers with carnival ride operators. Confirm availability, setup and teardown times, and any permits with the operator and the venue before you announce rides to guests.
*   **One Shared Schedule:** If your celebration spans more than one place, such as rides at a park on Saturday and a smaller family swim at a rental pool on Sunday afternoon, give guests a single timeline with each address and start time, and keep the pool guest list within the listing's limit.$sec$ || E'\n\n## Frequently Asked Questions (FAQ)\n')) = 'be8daa2489fbb57d13fdac8755d098c1'
returning id, md5(content) as new_md5, length(content) as new_len, updated_at;
