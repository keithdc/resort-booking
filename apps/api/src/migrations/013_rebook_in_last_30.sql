-- 013: put the sample rebook in the last 30 days so Reports last-30 is not empty

UPDATE inventory_blocks
SET check_in = CURRENT_DATE - 4,
    check_out = CURRENT_DATE - 1
WHERE booker_email = 'rebook.guest@example.com';
