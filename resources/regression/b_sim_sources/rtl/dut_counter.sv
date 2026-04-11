module dut_counter (
    input  logic clk,
    input  logic rst_n,
    output logic [3:0] cnt
);
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cnt <= '0;
        end else begin
            cnt <= cnt + 1'b1;
        end
    end
endmodule
